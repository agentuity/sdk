/**
 * Agentuity Build Configuration
 *
 * This file allows you to customize the build process for your Agentuity application.
 * You can add custom Bun plugins, exclude modules from bundling, and define
 * build-time constants.
 *
 * The configuration function is called once per build phase:
 * - 'api': Server-side bundle (app.ts + agents)
 * - 'web': Client-side bundle (HTML/CSS/JS in web folder)
 * - 'workbench': Workbench UI bundle
 *
 * @see https://agentuity.com/docs/build-configuration
 */

import type { BunPlugin } from 'bun';
import type { BuildPhase, BuildContext, BuildConfig } from '@agentuity/cli';

/**
 * Example: Custom Bun plugin
 *
 * Plugins can transform code, resolve modules, or perform other build-time tasks.
 * See: https://bun.sh/docs/bundler/plugins
 */
const examplePlugin: BunPlugin = {
	name: 'example-plugin',
	setup(build) {
		// Example: Log when bundling starts
		console.log(`[example-plugin] Bundling for ${build.config.target}`);

		// Example: Transform a specific module
		// build.onLoad({ filter: /\.custom$/ }, async (args) => {
		//   const text = await Bun.file(args.path).text();
		//   return {
		//     contents: `export default ${JSON.stringify(text)}`,
		//     loader: 'js',
		//   };
		// });
	},
};

/**
 * Example: Using Tailwind CSS plugin for styling
 *
 * 1. Install dependencies:
 *    bun add -d tailwindcss bun-plugin-tailwind
 *
 * 2. Import the plugin:
 *    import tailwindcss from 'bun-plugin-tailwind';
 *
 * 3. Add to plugins in the 'web' phase:
 *    if (phase === 'web') {
 *      return { plugins: [tailwindcss] };
 *    }
 *
 * 4. In your HTML, add:
 *    <link rel="stylesheet" href="tailwindcss" />
 *
 * @see https://tailwindcss.com
 * @see https://bun.sh/docs/bundler/fullstack#tailwindcss-plugin
 */

/**
 * Build configuration function
 *
 * @param phase - The current build phase ('api', 'web', or 'workbench')
 * @param context - Build context with project information and utilities
 * @returns Build configuration for the current phase
 */
export default function config(phase: BuildPhase, context: BuildContext): BuildConfig {
	const { rootDir, dev, outDir, srcDir, logger, region } = context;

	// Log configuration execution (visible with --log-level=debug)
	logger.debug(`Loading build config for phase: ${phase}`);

	// ==========================================
	// API Phase: Server-side bundle
	// ==========================================
	// Bundles app.ts and all agent files for server execution
	if (phase === 'api') {
		return {
			// Custom plugins (applied AFTER Agentuity's built-in plugin)
			// plugins: [examplePlugin],
			// External modules to exclude from bundling
			// These must be available at runtime (in node_modules)
			// external: [
			//   'native-module',        // Native Node.js modules
			//   'large-dependency',     // Large libraries you want to keep separate
			// ],
			// Build-time constants (replaced during bundling)
			// define: {
			//   '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
			//   '__VERSION__': JSON.stringify((await Bun.file('./package.json').json()).version),
			//   'process.env.CUSTOM_VAR': JSON.stringify(process.env.CUSTOM_VAR || ''),
			// },
		};
	}

	// ==========================================
	// Web Phase: Client-side bundle
	// ==========================================
	// Bundles HTML/CSS/JS from the web folder for browser execution
	if (phase === 'web') {
		return {
			// Example: Add Tailwind CSS plugin for styling
			// plugins: [tailwindcss],
			// External modules (rarely needed for web builds)
			// Most dependencies should be bundled for the browser
			// external: [],
			// Client-side build constants
			// define: {
			//   '__CLIENT__': JSON.stringify(true),
			//   '__API_URL__': JSON.stringify(dev ? 'http://localhost:3000' : 'https://api.example.com'),
			// },
		};
	}

	// ==========================================
	// Workbench Phase: Workbench UI bundle
	// ==========================================
	// Bundles the Agentuity workbench interface (if enabled via setupWorkbench)
	if (phase === 'workbench') {
		return {
			// Workbench-specific configuration
			// Usually you don't need to customize this phase
			// define: {
			//   '__WORKBENCH_THEME__': JSON.stringify('dark'),
			// },
		};
	}

	// ==========================================
	// Default: Empty config for unknown phases
	// ==========================================
	return {};
}

// ==========================================
// Advanced Examples
// ==========================================

/**
 * Example: Environment-specific configuration
 */
// export default function config(phase: BuildPhase, context: BuildContext): BuildConfig {
//   const { dev } = context;
//
//   const baseConfig: BuildConfig = {};
//
//   if (phase === 'api') {
//     baseConfig.define = {
//       '__DEV__': JSON.stringify(dev),
//     };
//
//     if (dev) {
//       // Development-specific settings
//       baseConfig.plugins = [debugPlugin];
//     } else {
//       // Production-specific settings
//       baseConfig.external = ['sharp', 'canvas'];
//     }
//   }
//
//   return baseConfig;
// }

/**
 * Example: Async configuration (load data at build time)
 */
// export default async function config(phase: BuildPhase, context: BuildContext): Promise<BuildConfig> {
//   if (phase === 'api') {
//     // Load configuration from a file or API
//     const apiConfig = await Bun.file('config/api.json').json();
//
//     return {
//       define: {
//         '__API_CONFIG__': JSON.stringify(apiConfig),
//       },
//     };
//   }
//
//   return {};
// }

/**
 * Example: Conditional plugin loading
 */
// import tailwindcss from 'bun-plugin-tailwind';
// import type { BuildPhase, BuildContext, BuildConfig } from '@agentuity/cli';
//
// export default function config(phase: BuildPhase, context: BuildContext): BuildConfig {
//   const plugins: BunPlugin[] = [];
//
//   if (phase === 'web') {
//     // Only load Tailwind in production for smaller dev builds
//     if (!context.dev) {
//       plugins.push(tailwindcss);
//     }
//   }
//
//   return { plugins };
// }

// ==========================================
// Important Notes
// ==========================================

/**
 * Reserved Define Keys (Cannot Override):
 * - process.env.AGENTUITY_*
 * - process.env.NODE_ENV
 * - process.env.AGENTUITY_CLOUD_SDK_VERSION
 * - process.env.AGENTUITY_CLOUD_ORG_ID
 * - process.env.AGENTUITY_CLOUD_PROJECT_ID
 * - process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID
 * - process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH
 *
 * These are managed by Agentuity and cannot be overridden for security reasons.
 */

/**
 * Plugin Execution Order:
 * 1. Agentuity's built-in plugin (route discovery, agent metadata, etc.)
 * 2. Your custom plugins (in the order specified)
 *
 * Your plugins run AFTER Agentuity's plugin, so you can transform
 * the output of Agentuity's processing.
 */

/**
 * External Modules:
 * - Modules listed in `external` are not bundled
 * - They must be present in node_modules at runtime
 * - Agentuity automatically externalizes: bun, fsevents, chromium-bidi, sharp
 * - Your externals are merged with these defaults
 */

/**
 * Build Context Properties:
 * - rootDir: Project root directory (absolute path)
 * - dev: Whether this is a development build
 * - outDir: Output directory (.agentuity by default)
 * - srcDir: Source directory (src/ by default)
 * - orgId: Organization ID (if available)
 * - projectId: Project ID (if available)
 * - region: Deployment region
 * - logger: Logger instance (use logger.debug, logger.info, etc.)
 */
