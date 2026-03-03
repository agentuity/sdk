import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { EntityType } from './types.ts';
import { loadCoderConfig } from '../../config/loader.ts';
import { getCoderProfile } from '../../plugin/hooks/tools.ts';

const ENTITY_TYPES: EntityType[] = ['user', 'org', 'project', 'repo', 'agent', 'model'];
const ENTITY_PREFIX = 'entity';

export interface EntityContext {
	user?: { id: string; email?: string; name?: string };
	org?: { id: string; name?: string };
	project?: { id: string; name?: string };
	repo?: { url?: string; path: string };
}

const WhoamiOrganizationSchema = z.object({
	id: z.string(),
	name: z.string(),
});

const WhoamiResponseSchema = z.object({
	userId: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	organizations: z.array(WhoamiOrganizationSchema),
});

const AgentuityProjectConfigSchema = z.object({
	projectId: z.string().optional(),
	orgId: z.string().optional(),
});

type AgentuityProjectConfig = z.infer<typeof AgentuityProjectConfigSchema>;

async function runCommand(
	command: string[],
	cwd?: string,
	env?: Record<string, string>
): Promise<{
	stdout: string;
	stderr: string;
	exitCode: number;
}> {
	const proc = Bun.spawn(command, {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
		env: env ? { ...process.env, ...env } : undefined,
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return {
		stdout: stdout.trim(),
		stderr: stderr.trim(),
		exitCode,
	};
}

async function fetchWhoami() {
	const profile = getCoderProfile();
	const result = await runCommand(['agentuity', '--json', 'auth', 'whoami'], undefined, {
		AGENTUITY_PROFILE: profile,
		AGENTUITY_AGENT_MODE: 'opencode',
	});

	if (result.exitCode !== 0 || !result.stdout) {
		return undefined;
	}

	try {
		const data = JSON.parse(result.stdout);
		const parsed = WhoamiResponseSchema.safeParse(data);
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

function normalizeRepoIdentifier(value: string): string {
	const trimmed = value.trim().replace(/\.git$/, '');

	if (trimmed.startsWith('git@')) {
		return trimmed.replace(/^git@/, '').replace(':', '/');
	}

	if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
		return trimmed.replace(/^https?:\/\//, '');
	}

	return trimmed;
}

function normalizePathIdentifier(value: string): string {
	return value
		.replace(/^[A-Za-z]:\\/, '')
		.replace(/[\\/]+/g, '_')
		.replace(/[^A-Za-z0-9._-]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

async function resolveRepoRemoteUrl(): Promise<string | undefined> {
	const result = await runCommand(['git', 'remote', 'get-url', 'origin']);

	if (result.exitCode !== 0 || !result.stdout) {
		return undefined;
	}

	return result.stdout;
}

function isEntityType(value: string): value is EntityType {
	return ENTITY_TYPES.includes(value as EntityType);
}

async function findProjectRoot(): Promise<string | undefined> {
	let current = resolve(process.cwd());
	let previous = '';

	while (current !== previous) {
		const candidate = Bun.file(join(current, 'agentuity.json'));
		if (await candidate.exists()) {
			return current;
		}

		previous = current;
		current = dirname(current);
	}

	return undefined;
}

async function loadAgentuityProjectConfig(): Promise<AgentuityProjectConfig | undefined> {
	const projectRoot = await findProjectRoot();
	if (!projectRoot) return undefined;

	const configFile = Bun.file(join(projectRoot, 'agentuity.json'));
	if (!(await configFile.exists())) return undefined;

	try {
		const content = await configFile.text();
		const parsed = AgentuityProjectConfigSchema.safeParse(JSON.parse(content));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

export async function getEntityContext(): Promise<EntityContext> {
	const [whoami, orgId, projectId, repoUrl] = await Promise.all([
		fetchWhoami(),
		resolveOrgId(),
		resolveProjectId(),
		resolveRepoRemoteUrl(),
	]);

	const userName = whoami ? `${whoami.firstName} ${whoami.lastName}`.trim() : undefined;

	return {
		user: whoami
			? {
					id: whoami.userId,
					name: userName || undefined,
				}
			: undefined,
		org: orgId ? { id: orgId } : undefined,
		project: projectId ? { id: projectId } : undefined,
		repo: {
			url: repoUrl || undefined,
			path: process.cwd(),
		},
	};
}

export function entityId(type: EntityType, id: string): string {
	return `${ENTITY_PREFIX}:${type}:${id}`;
}

export function parseEntityId(entityIdValue: string): { type: EntityType; id: string } {
	const [prefix, type, ...rest] = entityIdValue.split(':');

	if (prefix !== ENTITY_PREFIX || !type || !isEntityType(type) || rest.length === 0) {
		throw new Error(`Invalid entityId: ${entityIdValue}`);
	}

	return {
		type,
		id: rest.join(':'),
	};
}

export function kvKey(entityIdValue: string): string {
	return entityIdValue.startsWith(`${ENTITY_PREFIX}:`)
		? entityIdValue
		: `${ENTITY_PREFIX}:${entityIdValue}`;
}

export async function resolveUserId(): Promise<string | undefined> {
	const whoami = await fetchWhoami();
	return whoami?.userId;
}

export async function resolveOrgId(): Promise<string | undefined> {
	const config = await loadCoderConfig();
	return config.org;
}

export async function resolveProjectId(): Promise<string | undefined> {
	const config = await loadAgentuityProjectConfig();
	return config?.projectId;
}

export async function resolveRepoId(): Promise<string | undefined> {
	const repoUrl = await resolveRepoRemoteUrl();

	if (repoUrl) {
		return normalizeRepoIdentifier(repoUrl);
	}

	const cwd = normalizePathIdentifier(resolve(process.cwd()));
	return cwd.length > 0 ? cwd : undefined;
}
