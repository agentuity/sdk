import { YAML } from 'bun';
import { join, extname, basename, resolve, normalize } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readdir, readFile, writeFile, chmod } from 'node:fs/promises';
import JSON5 from 'json5';
import type { Config, Profile, AuthData } from './types';
import { ConfigSchema, ProjectSchema, BuildMetadataSchema, type BuildMetadata } from './types';
import * as tui from './tui';
import { z } from 'zod';

export function getDefaultConfigDir(): string {
	return join(homedir(), '.config', 'agentuity');
}

export function getDefaultConfigPath(): string {
	return join(getDefaultConfigDir(), 'production.yaml');
}

export function getProfilePath(): string {
	return join(getDefaultConfigDir(), 'profile');
}

export async function ensureConfigDir(): Promise<void> {
	const dir = getDefaultConfigDir();
	try {
		await mkdir(dir, { recursive: true, mode: 0o700 });
	} catch {
		// Ignore if already exists
	}
}

export async function saveProfile(path: string): Promise<void> {
	await ensureConfigDir();
	await writeFile(getProfilePath(), path, { mode: 0o644 });
}

export async function getProfile(): Promise<string> {
	const profilePath = getProfilePath();
	const defaultConfigPath = getDefaultConfigPath();

	try {
		const file = Bun.file(profilePath);
		if (await file.exists()) {
			const content = await file.text();
			const savedPath = content.trim();
			const savedFile = Bun.file(savedPath);
			if (await savedFile.exists()) {
				return savedPath;
			}
		}
	} catch {
		// Fall back to default
	}

	return defaultConfigPath;
}

export async function fetchProfiles(): Promise<Profile[]> {
	const configDir = getDefaultConfigDir();
	const currentConfigPath = await getProfile();
	const profiles: Profile[] = [];
	const nameRegex = /\bname:\s+["']?([\w-_]+)["']?/;

	try {
		const entries = await readdir(configDir);

		for (const entry of entries) {
			if (extname(entry) === '.yaml' && !entry.includes('templates/')) {
				const filePath = join(configDir, entry);

				try {
					const content = await readFile(filePath, 'utf-8');
					const match = nameRegex.exec(content);

					if (match && match[1]) {
						profiles.push({
							name: match[1],
							filename: filePath,
							selected: filePath === currentConfigPath,
						});
					}
				} catch {
					// Skip files we can't read
				}
			}
		}
	} catch {
		// Directory doesn't exist or can't be read
	}

	return profiles;
}

function expandTilde(path: string): string {
	if (path.startsWith('~/')) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

export async function loadConfig(customPath?: string): Promise<Config | null> {
	const configPath = customPath ? expandTilde(customPath) : await getProfile();

	try {
		const file = Bun.file(configPath);
		const exists = await file.exists();

		if (!exists) {
			return null;
		}

		const content = await file.text();
		const config = YAML.parse(content);

		// check to see if this is a legacy config file that might not have the required name
		// and in this case we can just use the filename
		const _config = config as { name?: string };
		if (!_config.name) {
			_config.name = basename(configPath).replace(extname(configPath), '');
		}

		const result = ConfigSchema.safeParse(config);
		if (!result.success) {
			tui.error(`Invalid config in ${configPath}:`);
			for (const issue of result.error.issues) {
				const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
				tui.bullet(`${path}: ${issue.message}`);
			}
			process.exit(1);
		}

		return result.data;
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error loading config from ${configPath}:`, error.message);
		}
		return null;
	}
}

function formatYAML(obj: unknown, indent = 0): string {
	const spaces = '    '.repeat(indent);
	const lines: string[] = [];

	if (typeof obj !== 'object' || obj === null) {
		return String(obj);
	}

	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) {
			continue;
		}

		if (typeof value === 'object' && !Array.isArray(value)) {
			lines.push(`${spaces}${key}:`);
			lines.push(formatYAML(value, indent + 1));
		} else if (Array.isArray(value)) {
			lines.push(`${spaces}${key}:`);
			for (const item of value) {
				if (typeof item === 'object') {
					lines.push(`${spaces}    -`);
					lines.push(formatYAML(item, indent + 2));
				} else {
					lines.push(`${spaces}    - ${item}`);
				}
			}
		} else if (typeof value === 'string') {
			if (value === '') {
				lines.push(`${spaces}${key}: ""`);
			} else if (value.includes(':') || value.includes('#') || value.includes(' ')) {
				lines.push(`${spaces}${key}: "${value}"`);
			} else {
				lines.push(`${spaces}${key}: ${value}`);
			}
		} else {
			lines.push(`${spaces}${key}: ${value}`);
		}
	}

	return lines.join('\n');
}

export async function saveConfig(config: Config, customPath?: string): Promise<void> {
	const configPath = customPath || (await getProfile());
	await ensureConfigDir();

	const content = formatYAML(config);
	await writeFile(configPath, content + '\n', { mode: 0o600 });
	// Ensure existing files get correct permissions on upgrade
	await chmod(configPath, 0o600);
}

async function getOrInitConfig(): Promise<Config> {
	const config = await loadConfig();
	if (config) {
		return config;
	}
	const profilePath = await getProfile();
	const name = basename(profilePath, '.yaml');
	return { name };
}

export async function saveAuth(auth: AuthData): Promise<void> {
	const config = await getOrInitConfig();
	config.auth = {
		api_key: auth.apiKey,
		user_id: auth.userId,
		expires: auth.expires.getTime(),
	};
	config.preferences = config.preferences || {};
	(config.preferences as Record<string, unknown>).orgId = '';
	await saveConfig(config);
}

export async function clearAuth(): Promise<void> {
	const config = await getOrInitConfig();
	config.auth = {
		api_key: '',
		user_id: '',
		expires: Date.now(),
	};
	config.preferences = config.preferences || {};
	(config.preferences as Record<string, unknown>).orgId = '';
	await saveConfig(config);
}

export async function saveProjectDir(projectDir: string): Promise<void> {
	const config = await getOrInitConfig();
	config.preferences = config.preferences || {};
	const normalized = resolve(normalize(projectDir));
	(config.preferences as Record<string, unknown>).project_dir = normalized;
	await saveConfig(config);
}

export async function saveOrgId(orgId: string): Promise<void> {
	const config = await getOrInitConfig();
	config.preferences = config.preferences || {};
	(config.preferences as Record<string, unknown>).orgId = orgId;
	await saveConfig(config);
}

export async function getAuth(): Promise<AuthData | null> {
	const config = await loadConfig();
	if (!config) return null;
	const auth = config.auth as { api_key?: string; user_id?: string; expires?: number } | undefined;

	if (!auth || !auth.api_key || !auth.user_id) {
		return null;
	}

	return {
		apiKey: auth.api_key,
		userId: auth.user_id,
		expires: new Date(auth.expires || 0),
	};
}

function getSchemaDescription(schema: z.ZodTypeAny): string | undefined {
	return (schema as unknown as { description?: string }).description;
}

function getPlaceholderValue(schema: z.ZodTypeAny): string {
	// Unwrap optional to get to the inner type
	let unwrapped = schema;
	if (schema instanceof z.ZodOptional) {
		unwrapped = (schema._def as unknown as { innerType: z.ZodTypeAny }).innerType;
	}

	// Check the type using constructor name
	const typeName = unwrapped.constructor.name;

	switch (typeName) {
		case 'ZodString':
			return '""';
		case 'ZodNumber':
			return '0';
		case 'ZodBoolean':
			return 'false';
		default:
			return '""';
	}
}

export function generateYAMLTemplate(name: string): string {
	const lines: string[] = [];

	// Add name (required)
	lines.push(`name: "${name}"`);
	lines.push('');

	// Get schema shape
	const shape = ConfigSchema.shape;

	// Only include user-configurable sections
	// Skip: auth (managed by login), devmode (internal), preferences (managed by CLI)
	const userConfigurableSections = ['overrides'];

	// Process each top-level field
	for (const [key, value] of Object.entries(shape)) {
		if (key === 'name') continue;
		if (!userConfigurableSections.includes(key)) continue;

		const schema = value as z.ZodTypeAny;

		// Unwrap optional to get to the inner schema
		let innerSchema = schema;
		if (schema instanceof z.ZodOptional) {
			innerSchema = (schema._def as unknown as { innerType: z.ZodTypeAny }).innerType;
		}

		const description = getSchemaDescription(schema);

		// Add section comment
		if (description) {
			lines.push(`# ${description}`);
		}

		// For object schemas, expand their properties
		if (innerSchema instanceof z.ZodObject) {
			const innerShape = innerSchema.shape;
			lines.push(`# ${key}:`);

			for (const [subKey, subValue] of Object.entries(innerShape)) {
				const subSchema = subValue as z.ZodTypeAny;
				const subDesc = getSchemaDescription(subSchema);
				const placeholder = getPlaceholderValue(subSchema);

				if (subDesc) {
					lines.push(`#     ${subKey}: ${placeholder}  # ${subDesc}`);
				} else {
					lines.push(`#     ${subKey}: ${placeholder}`);
				}
			}
		} else {
			const placeholder = getPlaceholderValue(schema);
			lines.push(`# ${key}: ${placeholder}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

class ProjectConfigNotFoundExpection extends Error {
	public name: string;
	constructor() {
		super('project not found');
		this.name = 'ProjectConfigNotFoundExpection';
	}
}

type ProjectConfig = z.infer<typeof ProjectSchema>;

function generateJSON5WithComments(
	schema: z.ZodObject<z.ZodRawShape>,
	data: Record<string, unknown>
): string {
	const lines: string[] = ['{'];
	const shape = schema.shape;
	const keys = Object.keys(shape);

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const fieldSchema = shape[key] as z.ZodTypeAny;
		const description = getSchemaDescription(fieldSchema);
		const value = data[key];

		if (description) {
			lines.push(`  // ${description}`);
		}

		const safeValue = value === undefined ? null : value;
		const jsonValue = JSON.stringify(safeValue);
		const comma = i < keys.length - 1 ? ',' : '';
		lines.push(`  ${JSON.stringify(key)}: ${jsonValue}${comma}`);
	}

	lines.push('}');
	return lines.join('\n');
}

export async function loadProjectConfig(dir: string): Promise<ProjectConfig> {
	const configPath = join(dir, 'agentuity.json');
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		throw new ProjectConfigNotFoundExpection();
	}
	const text = await file.text();
	const config = JSON5.parse(text);
	const result = ProjectSchema.safeParse(config);
	if (!result.success) {
		tui.error(`Invalid project config at ${configPath}:`);
		for (const issue of result.error.issues) {
			const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
			tui.bullet(`${path}: ${issue.message}`);
		}
		process.exit(1);
	}
	return result.data;
}

type InitialProjectConfig = ProjectConfig & {
	apiKey: string;
};

export async function createProjectConfig(dir: string, config: InitialProjectConfig) {
	const { apiKey, ...sanitizedConfig } = config;

	const configPath = join(dir, 'agentuity.json');
	const json5Content = generateJSON5WithComments(ProjectSchema, sanitizedConfig);
	await Bun.write(configPath, json5Content + '\n');

	const envPath = join(dir, '.env');
	const comment =
		'# AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
	const content = `${comment}\nAGENTUITY_SDK_KEY=${apiKey}\n`;
	await Bun.write(envPath, content);
	await chmod(envPath, 0o600);
}

export async function loadBuildMetadata(dir: string): Promise<BuildMetadata> {
	const filename = join(dir, 'agentuity.metadata.json');
	const file = Bun.file(filename);
	if (!(await file.exists())) {
		throw new Error(`couldn't find ${filename}`);
	}
	const buffer = await file.text();
	const config = JSON.parse(buffer);
	const result = BuildMetadataSchema.safeParse(config);
	if (!result.success) {
		tui.error(`Invalid build metadata at ${filename}:`);
		for (const issue of result.error.issues) {
			const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
			tui.bullet(`${path}: ${issue.message}`);
		}
		process.exit(1);
	}
	return result.data;
}
