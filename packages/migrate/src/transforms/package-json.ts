/**
 * Transform: Update @agentuity/* packages to ^2.0.0
 *
 * Handles:
 * - "latest" tag → "^2.0.0"
 * - "*" → "^2.0.0"
 * - v1.x.x versions → "^2.0.0"
 */

import type { OutdatedPackage } from '../detect';

export interface PackageJsonTransformResult {
	/** Updated package.json content, or null if no changes */
	content: string | null;
	/** List of packages that were updated */
	updated: string[];
}

/**
 * Update all outdated @agentuity/* packages to ^2.0.0
 */
export function transformPackageJson(
	currentContent: string,
	outdatedPackages: OutdatedPackage[]
): PackageJsonTransformResult {
	if (outdatedPackages.length === 0) {
		return { content: null, updated: [] };
	}

	try {
		const pkg = JSON.parse(currentContent);
		const updated: string[] = [];

		for (const outdated of outdatedPackages) {
			const { name, section } = outdated;

			if (pkg[section]?.[name]) {
				pkg[section][name] = '^2.0.0';
				updated.push(`${name}: ${outdated.currentVersion} → ^2.0.0`);
			}
		}

		if (updated.length === 0) {
			return { content: null, updated: [] };
		}

		// Format with indentation (matching typical package.json style)
		return {
			content: `${JSON.stringify(pkg, null, '\t')}\n`,
			updated,
		};
	} catch {
		return { content: null, updated: [] };
	}
}
