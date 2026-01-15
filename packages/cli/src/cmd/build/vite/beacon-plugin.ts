/**
 * Vite plugin to emit the analytics beacon as a hashed CDN asset
 *
 * This plugin:
 * 1. Reads the pre-built beacon from @agentuity/frontend
 * 2. Emits it as a Rollup asset with content-based hashing
 * 3. Injects a <script data-agentuity-beacon> tag into the HTML
 */

import type { Plugin, ResolvedConfig } from 'vite';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export interface BeaconPluginOptions {
	/** Whether analytics is enabled */
	enabled: boolean;
}

/**
 * Read the pre-built beacon script from @agentuity/frontend package
 * @param projectRoot - The root directory of the project (for resolving node_modules)
 */
async function readBeaconScript(projectRoot: string): Promise<string> {
	let frontendPath: string | null = null;

	// Strategy 1: Use Bun.resolve (works with workspaces and symlinks)
	try {
		frontendPath = await Bun.resolve('@agentuity/frontend', projectRoot);
	} catch {
		// Not found from project root
	}

	// Strategy 2: Try from this file's directory (for installed CLI case)
	if (!frontendPath) {
		try {
			const thisDir = new URL('.', import.meta.url).pathname;
			frontendPath = await Bun.resolve('@agentuity/frontend', thisDir);
		} catch {
			// Not found from CLI directory
		}
	}

	// Strategy 3: Fallback to createRequire for Node.js compatibility
	if (!frontendPath) {
		try {
			const projectRequire = createRequire(join(projectRoot, 'package.json'));
			frontendPath = projectRequire.resolve('@agentuity/frontend');
		} catch {
			// Not found via createRequire
		}
	}

	if (!frontendPath) {
		throw new Error(
			'Could not resolve @agentuity/frontend. Ensure the package is installed and built.'
		);
	}

	// The beacon.js file is in the dist folder of @agentuity/frontend
	// frontendPath points to dist/index.js, so we go up one level
	const packageDir = join(frontendPath, '..');
	const beaconPath = join(packageDir, 'beacon.js');

	const beaconFile = Bun.file(beaconPath);
	if (!(await beaconFile.exists())) {
		throw new Error(
			`Beacon script not found at ${beaconPath}. Run "bun run build" in @agentuity/frontend first.`
		);
	}

	return beaconFile.text();
}

/**
 * Vite plugin that emits the analytics beacon as a hashed asset
 * and injects a script tag into the HTML
 */
export function beaconPlugin(options: BeaconPluginOptions): Plugin {
	const { enabled } = options;

	let resolvedConfig: ResolvedConfig | null = null;
	let beaconReferenceId: string | null = null;

	return {
		name: 'agentuity:beacon',
		apply: 'build',

		configResolved(config) {
			resolvedConfig = config;
		},

		async buildStart() {
			if (!enabled) return;

			try {
				// Get project root from Vite config
				const projectRoot = resolvedConfig?.root || process.cwd();
				const beaconCode = await readBeaconScript(projectRoot);

				// Emit the beacon as an asset - Rollup will hash it
				beaconReferenceId = this.emitFile({
					type: 'asset',
					name: 'agentuity-beacon.js',
					source: beaconCode,
				});
			} catch (error) {
				this.error(`Failed to read beacon script: ${error instanceof Error ? error.message : String(error)}`);
			}
		},

		// Use transformIndexHtml hook to modify the HTML
		// This is called during the HTML transformation phase and works with Vite's HTML pipeline
		transformIndexHtml: {
			order: 'post',
			handler(html, ctx) {
				if (!enabled || !beaconReferenceId) return html;

				// Get the final hashed filename using the bundle from the context
				// We need to use ctx.bundle to access the emitted file
				const bundle = ctx.bundle;
				if (!bundle) return html;

				// Find our beacon asset in the bundle
				let beaconFileName: string | null = null;
				for (const fileName of Object.keys(bundle)) {
					if (fileName.includes('agentuity-beacon') && fileName.endsWith('.js')) {
						beaconFileName = fileName;
						break;
					}
				}

				if (!beaconFileName) return html;

				// Build the beacon URL using Vite's configured base (respects CDN URL)
				// resolvedConfig.base is e.g., "https://cdn.agentuity.com/{deploymentId}/client/" or "/"
				const base = resolvedConfig?.base || '/';
				// Normalize: ensure base ends with / and beaconFileName doesn't start with /
				const normalizedBase = base.endsWith('/') ? base : `${base}/`;
				const normalizedFileName = beaconFileName.startsWith('/')
					? beaconFileName.slice(1)
					: beaconFileName;
				const beaconUrl = `${normalizedBase}${normalizedFileName}`;

				// Inject a marker script tag
				// The script must be sync (no async/defer) to patch history API before router loads
				// Use data-agentuity-beacon attribute as a marker for config/session injection
				const beaconScript = `<script data-agentuity-beacon src="${beaconUrl}"></script>`;

				// Inject before </head>
				if (html.includes('</head>')) {
					return html.replace('</head>', `${beaconScript}</head>`);
				}
				// Fallback: inject at start of body
				if (html.includes('<body')) {
					return html.replace(/<body([^>]*)>/, `<body$1>${beaconScript}`);
				}

				return beaconScript + html;
			},
		},
	};
}
