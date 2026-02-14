import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export const REQUIRED_TABLES = new Set(['session', 'message', 'part', 'todo']);

export function isMemoryPath(path: string): boolean {
	return path === ':memory:' || path.includes('mode=memory');
}

export function getDefaultDBCandidates(): string[] {
	const home = homedir();
	const candidates: string[] = [];
	const currentPlatform = platform();

	if (currentPlatform === 'darwin') {
		candidates.push(join(home, 'Library', 'Application Support', 'opencode', 'opencode.db'));
	}

	if (currentPlatform === 'win32') {
		const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
		const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
		candidates.push(join(appData, 'opencode', 'opencode.db'));
		candidates.push(join(localAppData, 'opencode', 'opencode.db'));
	}

	candidates.push(join(home, '.local', 'share', 'opencode', 'opencode.db'));

	return candidates;
}

export async function resolveOpenCodeDBPath(): Promise<string | null> {
	const envPath = process.env.OPENCODE_DB_PATH;
	if (envPath) {
		if (isMemoryPath(envPath)) return envPath;
		if (await Bun.file(envPath).exists()) return envPath;
	}

	const candidates = getDefaultDBCandidates();
	for (const candidate of candidates) {
		if (await Bun.file(candidate).exists()) {
			return candidate;
		}
	}

	return null;
}

/**
 * Parse display title from session title JSON.
 * OpenCode stores titles as JSON strings like: {"title":"Some Title"}
 * Falls back to the raw title if parsing fails.
 */
export function parseDisplayTitle(title: string): string {
	if (!title) return '';
	try {
		const parsed = JSON.parse(title);
		if (typeof parsed === 'object' && parsed !== null && typeof parsed.title === 'string') {
			return parsed.title;
		}
	} catch {
		// Not JSON, return as-is
	}
	return title;
}
