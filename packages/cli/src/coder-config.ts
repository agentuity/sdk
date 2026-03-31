import { defaultProfileName, getOrInitConfig, loadConfig, saveConfig } from './config';
import { normalizeCoderHubHttpUrl } from './coder-hub-url';
import {
	deleteCoderApiKeyFromKeychain,
	getCoderApiKeyFromKeychain,
	isMacOS,
	saveCoderApiKeyToKeychain,
} from './keychain';
import type { Config } from './types';

function getProfileName(config?: Config | null): string {
	return config?.name || defaultProfileName;
}

function pruneCoderConfig(config: Config): void {
	if (!config.coder) return;

	const nextCoder = { ...config.coder };
	if (!nextCoder.hubUrl) delete nextCoder.hubUrl;
	if (!nextCoder.apiKey) delete nextCoder.apiKey;

	if (Object.keys(nextCoder).length === 0) {
		delete config.coder;
		return;
	}

	config.coder = nextCoder;
}

export async function saveCoderHubUrl(
	hubUrl: string
): Promise<{ profileName: string; hubUrl: string }> {
	const normalized = normalizeCoderHubHttpUrl(hubUrl);
	const config = await getOrInitConfig();
	const profileName = getProfileName(config);

	config.coder = {
		...config.coder,
		hubUrl: normalized,
	};

	await saveConfig(config);
	return { profileName, hubUrl: normalized };
}

export async function getStoredCoderHubUrl(config?: Config | null): Promise<string | null> {
	const loadedConfig = config ?? (await loadConfig());
	const hubUrl = loadedConfig?.coder?.hubUrl?.trim();
	if (!hubUrl) return null;
	return normalizeCoderHubHttpUrl(hubUrl);
}

export async function saveCoderApiKey(apiKey: string): Promise<{ profileName: string }> {
	const trimmed = apiKey.trim();
	const config = await getOrInitConfig();
	const profileName = getProfileName(config);

	if (isMacOS()) {
		try {
			await saveCoderApiKeyToKeychain(profileName, trimmed);
			if (config.coder?.apiKey) {
				config.coder = {
					...config.coder,
				};
				delete config.coder.apiKey;
			}
			pruneCoderConfig(config);
			await saveConfig(config);
			return { profileName };
		} catch {
			// Fall back to config-file storage below.
		}
	}

	config.coder = {
		...config.coder,
		apiKey: trimmed,
	};

	await saveConfig(config);
	return { profileName };
}

export async function getStoredCoderApiKey(config?: Config | null): Promise<string | null> {
	const loadedConfig = config ?? (await loadConfig());
	const profileName = getProfileName(loadedConfig);

	if (isMacOS()) {
		try {
			const keychainValue = await getCoderApiKeyFromKeychain(profileName);
			if (keychainValue) {
				if (loadedConfig?.coder?.apiKey) {
					const configCopy = {
						...loadedConfig,
						coder: {
							...loadedConfig.coder,
						},
					};
					delete configCopy.coder.apiKey;
					pruneCoderConfig(configCopy);
					await saveConfig(configCopy);
				}
				return keychainValue.trim() || null;
			}
		} catch {
			// Fall back to config-file storage below.
		}
	}

	const storedValue = loadedConfig?.coder?.apiKey?.trim();
	return storedValue || null;
}

export async function clearStoredCoderApiKey(): Promise<{ profileName: string }> {
	const config = await getOrInitConfig();
	const profileName = getProfileName(config);

	if (isMacOS()) {
		try {
			await deleteCoderApiKeyFromKeychain(profileName);
		} catch {
			// Ignore keychain cleanup errors.
		}
	}

	if (config.coder?.apiKey) {
		config.coder = {
			...config.coder,
		};
		delete config.coder.apiKey;
		pruneCoderConfig(config);
		await saveConfig(config);
	}

	return { profileName };
}
