/**
 * Prompt file versioning utilities.
 *
 * Version format at end of file: <!-- prompt_version: [version]/[hash] -->
 *
 * - version: manually incremented number when prompt content changes
 * - hash: SHA256 of file content (excluding the version line)
 *
 * This allows detecting:
 * - If user has modified the file (hash doesn't match)
 * - If our version is newer (version number comparison)
 */

const VERSION_REGEX = /\n?<!-- prompt_version: (\d+)\/([a-f0-9]+) -->$/;

export interface PromptVersionInfo {
	version: number;
	hash: string;
}

/**
 * Compute SHA256 hash of content using Bun's built-in hasher.
 */
export function computeHash(content: string): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(content);
	return hasher.digest('hex');
}

/**
 * Strip the version comment from content.
 */
export function stripVersionComment(content: string): string {
	return content.replace(VERSION_REGEX, '');
}

/**
 * Extract version info from file content.
 * Returns null if no version comment found.
 */
export function extractVersionInfo(content: string): PromptVersionInfo | null {
	const match = content.match(VERSION_REGEX);
	if (!match) {
		return null;
	}
	return {
		version: parseInt(match[1], 10),
		hash: match[2],
	};
}

/**
 * Generate content with version comment appended.
 */
export function appendVersionComment(content: string, version: number): string {
	const hash = computeHash(content);
	return `${content}\n<!-- prompt_version: ${version}/${hash} -->`;
}

/**
 * Check if a file has been modified by the user.
 * Returns true if the file content doesn't match the expected hash.
 */
export function isUserModified(fileContent: string): boolean {
	const versionInfo = extractVersionInfo(fileContent);
	if (!versionInfo) {
		// No version info = either new file or user completely rewrote it
		return true;
	}

	const contentWithoutVersion = stripVersionComment(fileContent);
	const actualHash = computeHash(contentWithoutVersion);

	return actualHash !== versionInfo.hash;
}

/**
 * Check if a prompt file needs to be updated.
 *
 * @param fileContent - Current file content
 * @param currentVersion - Our current prompt version
 * @returns Object with update status and reason
 */
export function checkUpdateStatus(
	fileContent: string,
	currentVersion: number
): {
	needsUpdate: boolean;
	isUserModified: boolean;
	fileVersion: number | null;
	reason: string;
} {
	const versionInfo = extractVersionInfo(fileContent);

	if (!versionInfo) {
		return {
			needsUpdate: true,
			isUserModified: false,
			fileVersion: null,
			reason: 'No version info found',
		};
	}

	const contentWithoutVersion = stripVersionComment(fileContent);
	const actualHash = computeHash(contentWithoutVersion);
	const userModified = actualHash !== versionInfo.hash;

	if (userModified) {
		return {
			needsUpdate: false,
			isUserModified: true,
			fileVersion: versionInfo.version,
			reason: 'File has been modified by user',
		};
	}

	if (versionInfo.version < currentVersion) {
		return {
			needsUpdate: true,
			isUserModified: false,
			fileVersion: versionInfo.version,
			reason: `File version ${versionInfo.version} is older than current version ${currentVersion}`,
		};
	}

	return {
		needsUpdate: false,
		isUserModified: false,
		fileVersion: versionInfo.version,
		reason: 'File is up to date',
	};
}
