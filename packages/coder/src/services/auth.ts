import { homedir } from 'node:os';
import { join } from 'node:path';
import { YAML } from 'bun';

export interface CloudContext {
	authenticated: boolean;
	orgId?: string;
	userId?: string;
}

interface ConfigFile {
	name?: string;
	auth?: {
		api_key?: string;
		user_id?: string;
		expires?: number;
	};
	preferences?: {
		orgId?: string;
	};
	coder?: {
		org?: string;
	};
}

const AGENTUITY_CONFIG_DIR = join(homedir(), '.config', 'agentuity');
const DEFAULT_PROFILE = 'production.yaml';

async function getProfilePath(): Promise<string> {
	const profileFile = Bun.file(join(AGENTUITY_CONFIG_DIR, 'profile'));

	if (await profileFile.exists()) {
		const savedPath = (await profileFile.text()).trim();
		const savedFile = Bun.file(savedPath);
		if (await savedFile.exists()) {
			return savedPath;
		}
	}

	return join(AGENTUITY_CONFIG_DIR, DEFAULT_PROFILE);
}

export async function getCloudContext(): Promise<CloudContext> {
	try {
		const configPath = await getProfilePath();
		const configFile = Bun.file(configPath);

		if (!(await configFile.exists())) {
			return { authenticated: false };
		}

		const content = await configFile.text();
		const config = YAML.parse(content) as ConfigFile;

		const hasAuth = Boolean(config.auth?.api_key);
		const orgId = config.coder?.org ?? config.preferences?.orgId;

		return {
			authenticated: hasAuth,
			orgId,
			userId: config.auth?.user_id,
		};
	} catch {
		return { authenticated: false };
	}
}

export async function checkAuth(): Promise<
	{ ok: true; context: CloudContext } | { ok: false; error: string }
> {
	const context = await getCloudContext();

	if (!context.authenticated) {
		return {
			ok: false,
			error: 'Not authenticated. Run `agentuity auth login` first.',
		};
	}

	if (!context.orgId) {
		return {
			ok: false,
			error: 'No organization selected. Run `agentuity cloud org select` first.',
		};
	}

	return { ok: true, context };
}
