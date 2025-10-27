import { YAML } from 'bun';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Config } from './types';

export function getDefaultConfigPath(): string {
	return join(homedir(), '.config', 'agentuity', 'config.yaml');
}

export async function loadConfig(customPath?: string): Promise<Config> {
	const configPath = customPath || getDefaultConfigPath();

	try {
		const file = Bun.file(configPath);
		const exists = await file.exists();

		if (!exists) {
			return {};
		}

		const content = await file.text();
		const config = YAML.parse(content);

		return (config as Config) || {};
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error loading config from ${configPath}:`, error.message);
		}
		return {};
	}
}
