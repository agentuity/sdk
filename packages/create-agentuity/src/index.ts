/**
 * Derive the npm dist-tag from the create-agentuity version.
 *
 * Since create-agentuity and @agentuity/cli are published in lockstep
 * under the same dist-tag, we use the prerelease identifier to determine
 * which tag to install from:
 *
 *   bun create agentuity@^3.0.0-alpha.0  → @agentuity/cli@alpha
 *   bun create agentuity@^2.0.0-beta.1   → @agentuity/cli@beta
 *   bun create agentuity@^2.0.0-rc.2     → @agentuity/cli@rc
 *   bun create agentuity                  → @agentuity/cli@latest
 *   bun create agentuity@2.0.2           → @agentuity/cli@2.0.2 (exact)
 *
 * For stable versions (no prerelease), we use the exact version number
 * so that `bun create agentuity@2.0.2` pins to that specific CLI version.
 */
export function getCliVersionSpecifier(version: string): string {
	// Prerelease: extract the tag from the prerelease identifier
	const match = version.match(/-([a-zA-Z]+)/);
	if (match?.[1]) {
		return match[1].toLowerCase();
	}
	// Stable versions: use the exact version to ensure major version compatibility
	return version;
}
