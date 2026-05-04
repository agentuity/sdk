/**
 * Existing-project detection for `agentuity project create`.
 *
 * The create command's normal flow is: pick a framework → run its create
 * CLI → augment with Agentuity. That's the wrong thing to do when the
 * user runs `agentuity project create` while already standing inside a
 * supported framework project — they almost certainly mean "register
 * THIS project", not "scaffold a brand new one alongside it".
 *
 * This module looks at a directory and returns a hit when it matches a
 * framework that's also in our scaffold catalog (next, nuxt, remix /
 * react-router, sveltekit, astro, hono, vite-react). The create command
 * uses the hit to prompt the user "import this project instead?" and
 * hand off to the existing project-import flow on yes.
 *
 * We deliberately scope this to the scaffold catalog rather than every
 * framework the build detector recognizes; that way the prompt only
 * fires for things we're confident the user could equally have created
 * via `agentuity project create`.
 */

import { existsSync } from 'node:fs';
import {
	detectFrameworkWithPackageJson,
	type DetectedFramework,
	type PackageJsonData,
} from '../build/detect';

/**
 * A successful detection. The `scaffoldSlug` is what `frameworkCatalog`
 * in `frameworks.ts` would call this framework; `detectedName` is the
 * human-readable label used in the user-facing prompt.
 */
export interface ExistingProjectHit {
	/** Slug from `frameworkCatalog` (next, nuxt, remix, sveltekit, astro, hono, vite-react). */
	scaffoldSlug: string;
	/** Human-readable framework name for display ("Next.js", "Hono", ...). */
	detectedName: string;
	/** The detector's version string (when known). Useful for the prompt. */
	version?: string;
	/** True if `agentuity.json` already exists in the directory. */
	hasAgentuityJson: boolean;
}

/**
 * Mapping table from build-detect slugs to scaffold catalog slugs.
 *
 * Two interesting cases:
 *   - `remix` and `react-router` both map to the scaffold's `remix`
 *     entry, because our scaffold uses `create-react-router@latest`
 *     under the slug `remix`.
 *   - `vite` requires an extra package check (does it have `react`?)
 *     so it isn't in this table; it's handled below.
 */
const DETECT_TO_SCAFFOLD: Record<string, { slug: string; name: string }> = {
	nextjs: { slug: 'nextjs', name: 'Next.js' },
	nuxt: { slug: 'nuxt', name: 'Nuxt' },
	remix: { slug: 'remix', name: 'React Router' },
	'react-router': { slug: 'remix', name: 'React Router' },
	sveltekit: { slug: 'sveltekit', name: 'SvelteKit' },
	astro: { slug: 'astro', name: 'Astro' },
};

/** Returns true if `name` is in dependencies or devDependencies. */
function hasDep(pkg: PackageJsonData, name: string): boolean {
	return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

/**
 * For frameworks the build detector doesn't have a dedicated rule for
 * (Hono) or matches too coarsely for our purposes (Vite — could be vue,
 * svelte, vanilla, ...), use direct package.json signals.
 */
function fromPackageJson(pkg: PackageJsonData): { slug: string; name: string } | null {
	// Hono has no entry in `frameworkDefinitions`; it falls through to
	// the generic detector. Match it explicitly.
	if (hasDep(pkg, 'hono')) {
		return { slug: 'hono', name: 'Hono' };
	}
	// vite-react: detected as "vite" by the framework DB but we only
	// want to suggest the React-flavored scaffold when react is also
	// present.
	if (hasDep(pkg, 'vite') && hasDep(pkg, 'react')) {
		return { slug: 'vite-react', name: 'Vite + React' };
	}
	return null;
}

/**
 * Inspect `dir` and return an `ExistingProjectHit` if it matches a
 * framework supported by `agentuity project create` (or already has an
 * `agentuity.json`). Returns `null` otherwise.
 *
 * Never throws — failures during detection (missing package.json,
 * malformed JSON, etc.) just yield `null` so the caller can fall
 * through to the normal create flow.
 */
export async function detectExistingProject(dir: string): Promise<ExistingProjectHit | null> {
	let detection: { framework: DetectedFramework | null; packageJson: PackageJsonData | null };
	try {
		detection = await detectFrameworkWithPackageJson(dir);
	} catch {
		return null;
	}

	const { framework, packageJson } = detection;
	if (!packageJson) {
		// No package.json → not a JS/TS project we care about here.
		return null;
	}

	const hasAgentuityJson = existsSync(`${dir}/agentuity.json`);

	// Prefer the framework database hit when it lands on something we
	// have a scaffold for. `vite` deliberately falls through here
	// because vite-react needs the extra react-package check below.
	if (framework && framework.name !== 'vite') {
		const mapped = DETECT_TO_SCAFFOLD[framework.name];
		if (mapped) {
			return {
				scaffoldSlug: mapped.slug,
				detectedName: mapped.name,
				version: framework.version,
				hasAgentuityJson,
			};
		}
	}

	// Fallback: hono / vite-react via direct package.json signals.
	const direct = fromPackageJson(packageJson);
	if (direct) {
		return {
			scaffoldSlug: direct.slug,
			detectedName: direct.name,
			version: framework?.version,
			hasAgentuityJson,
		};
	}

	return null;
}
