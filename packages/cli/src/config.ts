import { z } from 'zod';
import { existsSync, mkdirSync } from 'node:fs';
import { StructuredError, type Logger } from '@agentuity/core';
import {
	BuildMetadataSchema,
	type BuildMetadata,
	getServiceUrls,
	APIClient as ServerAPIClient,
} from '@agentuity/server';
import { YAML } from 'bun';
import { join, extname, basename, resolve, normalize } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readdir, readFile, writeFile, chmod } from 'node:fs/promises';
import JSON5 from 'json5';
import type { Config, Profile, AuthData } from './types';
import { ConfigSchema, ProjectSchema } from './types';
import * as tui from './tui';
import {
	isMacOS,
	saveAuthToKeychain,
	getAuthFromKeychain,
	deleteAuthFromKeychain,
} from './keychain';

export const defaultProfileName = 'production';

export function getDefaultConfigDir(): string {
	return join(homedir(), '.config', 'agentuity');
}

export function getDefaultConfigPath(): string {
	return join(getDefaultConfigDir(), defaultProfileName + '.yaml');
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
	await writeFile(getProfilePath(), path, { mode: 0o600 });
}

export async function getProfile(): Promise<string> {
	// Check environment variable first
	if (process.env.AGENTUITY_PROFILE) {
		const profileName = process.env.AGENTUITY_PROFILE;
		const envProfilePath = join(getDefaultConfigDir(), `${profileName}.yaml`);
		const envFile = Bun.file(envProfilePath);
		if (await envFile.exists()) {
			return envProfilePath;
		}
	}

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

					if (match?.[1]) {
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

let cachedConfig: Config | null | undefined;

export async function loadConfig(customPath?: string): Promise<Config | null> {
	// Don't use cache when explicitly loading a specific file path
	// This prevents new profiles from inheriting cached config from current profile
	if (cachedConfig !== undefined && !customPath) {
		return cachedConfig;
	}
	const configPath = customPath ? expandTilde(customPath) : await getProfile();

	try {
		const file = Bun.file(configPath);
		const exists = await file.exists();
		let result: ReturnType<typeof ConfigSchema.safeParse>;

		if (exists) {
			const content = await file.text();
			const config = YAML.parse(content);

			// check to see if this is a legacy config file that might not have the required name
			// and in this case we can just use the filename
			const _config = config as { name?: string };
			if (!_config.name) {
				_config.name = basename(configPath).replace(extname(configPath), '');
			}

			result = ConfigSchema.safeParse(config);
		} else {
			result = ConfigSchema.safeParse({ name: defaultProfileName });
		}

		if (!result.success) {
			tui.error(`Invalid config in ${configPath}:`);
			for (const issue of result.error.issues) {
				const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
				tui.bullet(`${path}: ${issue.message}`);
			}
			process.exit(1);
		}

		// allow environment variables to override
		const overrides = result.data.overrides ?? ConfigSchema.shape.overrides.parse({});
		if (overrides) {
			if (process.env.AGENTUITY_API_URL) {
				overrides.api_url = process.env.AGENTUITY_API_URL;
			}
			if (process.env.AGENTUITY_APP_URL) {
				overrides.app_url = process.env.AGENTUITY_APP_URL;
			}
			if (process.env.AGENTUITY_CATALYST_URL) {
				overrides.catalyst_url = process.env.AGENTUITY_CATALYST_URL;
			}
			if (process.env.AGENTUITY_TRANSPORT_URL) {
				overrides.transport_url = process.env.AGENTUITY_TRANSPORT_URL;
			}
			if (process.env.AGENTUITY_KEYVALUE_URL) {
				overrides.kv_url = process.env.AGENTUITY_KEYVALUE_URL;
			}
			if (process.env.AGENTUITY_VECTOR_URL) {
				overrides.vector_url = process.env.AGENTUITY_VECTOR_URL;
			}
			if (process.env.AGENTUITY_STREAM_URL) {
				overrides.stream_url = process.env.AGENTUITY_STREAM_URL;
			}
			result.data.overrides = overrides;
			}

			// Only cache the default profile, not custom path loads
			// This prevents explicit loads from overwriting the cached default profile
			if (!customPath) {
			cachedConfig = result.data;
			}
			return result.data;
			} catch (error) {
			if (error instanceof Error) {
			console.error(`Error loading config from ${configPath}:`, error.message);
			}
			// Only update cache on error if loading default profile
			if (!customPath) {
			cachedConfig = null;
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
	
	// Only cache the default profile, not custom path saves
	if (!customPath) {
		cachedConfig = config;
	}
}

export async function getOrInitConfig(): Promise<Config> {
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
	const profileName = config.name || defaultProfileName;

	const authData = {
		api_key: auth.apiKey,
		user_id: auth.userId,
		expires: auth.expires.getTime(),
	};

	// On macOS, store in Keychain for better security
	if (isMacOS()) {
		try {
			await saveAuthToKeychain(profileName, authData);

			// Successfully stored in keychain, remove from config if present
			if (config.auth) {
				delete config.auth;
				await saveConfig(config);
			}
			return;
		} catch (error) {
			// Keychain failed, fall back to config file
			console.warn('Failed to store auth in keychain, falling back to config file:', error);
		}
	}

	// Store in config file (non-macOS or keychain failed)
	config.auth = authData;
	config.preferences = config.preferences || {};
	(config.preferences as Record<string, unknown>).orgId = '';

	await saveConfig(config);
}

export async function clearAuth(): Promise<void> {
	const config = await getOrInitConfig();
	const profileName = config.name || defaultProfileName;

	// On macOS, clear from Keychain
	if (isMacOS()) {
		try {
			await deleteAuthFromKeychain(profileName);
		} catch {
			// Ignore errors - keychain entry may not exist
		}
	}

	// Also clear from config file (for backwards compatibility)
	if (config.auth) {
		delete config.auth;
		config.preferences = config.preferences || {};
		(config.preferences as Record<string, unknown>).orgId = '';
		await saveConfig(config);
	}
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
	const profileName = config?.name || defaultProfileName;

	// Priority 1: Allow automated login from environment variables
	if (process.env.AGENTUITY_CLI_API_KEY && process.env.AGENTUITY_USER_ID) {
		return {
			apiKey: process.env.AGENTUITY_CLI_API_KEY,
			userId: process.env.AGENTUITY_USER_ID,
			expires: new Date(Date.now() + 30 * 60_000),
		};
	}

	// Priority 2: On macOS, try to read from Keychain
	if (isMacOS()) {
		try {
			const keychainAuth = await getAuthFromKeychain(profileName);
			if (keychainAuth) {
				return {
					apiKey: keychainAuth.api_key,
					userId: keychainAuth.user_id,
					expires: new Date(keychainAuth.expires),
				};
			}
		} catch {
			// Keychain read failed, fall through to config file
		}
	}

	// Priority 3: Read from config file (non-macOS or keychain failed)
	if (!config) return null;
	const auth = config.auth as { api_key?: string; user_id?: string; expires?: number } | undefined;

	if (!auth || !auth.api_key || !auth.user_id) {
		return null;
	}

	const expiresDate = new Date(auth.expires || 0);

	return {
		apiKey: auth.api_key,
		userId: auth.user_id,
		expires: expiresDate,
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

		// Unwrap optional and nullable to get to the inner schema
		// Note: .optional().nullable() creates ZodNullable(ZodOptional(ZodObject))
		let innerSchema = schema;
		if (innerSchema instanceof z.ZodNullable) {
			innerSchema = (innerSchema._def as unknown as { innerType: z.ZodTypeAny }).innerType;
		}
		if (innerSchema instanceof z.ZodOptional) {
			innerSchema = (innerSchema._def as unknown as { innerType: z.ZodTypeAny }).innerType;
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

export async function loadProjectConfig(
	dir: string,
	config?: Config | null
): Promise<ProjectConfig> {
	let configPath = join(dir, 'agentuity.json');

	// Check for profile-specific override if config is provided
	if (config?.name) {
		const profileConfigPath = join(dir, `agentuity.${config.name}.json`);
		if (await Bun.file(profileConfigPath).exists()) {
			configPath = profileConfigPath;
		}
	}

	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		// TODO: check to see if a valid project that was created unauthenticated
		// and then if so:
		// 1. if authentication, offer to import the project
		// 2. tell them that they need to login to use the command and import the project
		throw new ProjectConfigNotFoundExpection();
	}
	const text = await file.text();
	const parsedConfig = JSON5.parse(text);
	const result = ProjectSchema.safeParse(parsedConfig);
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

export const InitialProjectConfigSchema = z.intersection(
	ProjectSchema,
	z.object({
		sdkKey: z.string().describe('the project specific SDK key'),
		$schema: z.string().optional(),
	})
);

type InitialProjectConfig = z.infer<typeof InitialProjectConfigSchema>;

export async function createProjectConfig(dir: string, config: InitialProjectConfig) {
	const { sdkKey, ...sanitizedConfig } = config;

	// generate the project config
	const configPath = join(dir, 'agentuity.json');
	const configData = {
		$schema: 'https://agentuity.dev/schema/cli/v1/agentuity.json',
		...sanitizedConfig,
	};
	await Bun.write(configPath, JSON.stringify(configData, null, 2) + '\n');

	// generate the .env file with initial secret
	const envPath = join(dir, '.env');
	const comment =
		'# AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
	const content = `${comment}\nAGENTUITY_SDK_KEY=${sdkKey}\n`;
	await Bun.write(envPath, content);
	await chmod(envPath, 0o600);

	// generate the vscode settings
	const vscodeDir = join(dir, '.vscode');
	mkdirSync(vscodeDir);

	const settings = {
		'search.exclude': {
			'**/.git/**': true,
			'**/node_modules/**': true,
			'**/bun.lock': true,
			'**/.agentuity/**': true,
		},
		'json.schemas': [
			{
				fileMatch: ['agentuity.json'],
				url: 'https://agentuity.dev/schema/cli/v1/agentuity.json',
			},
		],
	};

	await Bun.write(join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 2));
}

const BuildMetadataNotFoundError = StructuredError('BuildMetadataNotFoundError');

export async function loadBuildMetadata(dir: string): Promise<BuildMetadata> {
	const filename = join(dir, 'agentuity.metadata.json');
	const file = Bun.file(filename);
	if (!(await file.exists())) {
		throw new BuildMetadataNotFoundError({ message: `couldn't find ${filename}` });
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

export async function loadProjectSDKKey(
	logger: Logger,
	projectDir: string
): Promise<string | undefined> {
	const c = await getOrInitConfig();
	const files: string[] =
		process.env.NODE_ENV === 'production' || c?.name !== 'local'
			? ['.env', '.env.production']
			: ['.env.development', '.env'];
	if (c) {
		files.unshift(`.env.${c.name}`);
	}
	logger.trace(`[SDK_KEY] Searching for AGENTUITY_SDK_KEY in files: ${files.join(', ')}`);
	logger.trace(`[SDK_KEY] Project directory: ${projectDir}`);
	logger.trace(`[SDK_KEY] NODE_ENV: ${process.env.NODE_ENV}`);
	for (const filename of files) {
		const fn = join(projectDir, filename);
		logger.trace(`[SDK_KEY] Checking file: ${fn}`);
		if (existsSync(fn)) {
			logger.trace(`[SDK_KEY] File exists: ${fn}`);
			const buf = await Bun.file(fn).text();
			const tok = buf.split(/\n/);
			for (const t of tok) {
				if (t.charAt(0) !== '#' && t.startsWith('AGENTUITY_SDK_KEY=')) {
					const i = t.indexOf('=');
					const key = t.substring(i + 1).trim();
					logger.trace(`[SDK_KEY] Found AGENTUITY_SDK_KEY in: ${fn}`);
					logger.trace(`[SDK_KEY] Key value: ${key.substring(0, 10)}...`);
					return key;
				}
			}
			logger.trace(`[SDK_KEY] No AGENTUITY_SDK_KEY found in: ${fn}`);
		} else {
			logger.trace(`[SDK_KEY] File does not exist: ${fn}`);
		}
	}
	logger.trace(`[SDK_KEY] AGENTUITY_SDK_KEY not found in any file`);
}

export function getCatalystAPIClient(logger: Logger, auth: AuthData, region: string) {
	const serviceUrls = getServiceUrls(region);
	const catalystUrl = serviceUrls.catalyst;
	return new ServerAPIClient(catalystUrl, logger, auth.apiKey);
}

export function getIONHost(config: Config | null, region: string) {
	if (config?.overrides?.ion_url) {
		const url = new URL(config.overrides.ion_url);
		return url.hostname;
	}
	if (config?.name === 'local' || region === 'local') {
		return 'ion.agentuity.io';
	}
	return `ion-${region}.agentuity.cloud`;
}

export function getStreamURL(region: string, config: Config | null) {
	if (config?.name === 'local') {
		return 'https://streams.agentuity.io';
	}
	const serviceUrls = getServiceUrls(region);
	return serviceUrls.stream;
}
