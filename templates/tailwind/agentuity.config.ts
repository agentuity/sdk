/**
 * Agentuity Build Configuration - Tailwind CSS Template
 *
 * This configuration enables Tailwind CSS v4 for your web application.
 * The bun-plugin-tailwind automatically scans your TSX files and generates
 * optimized CSS containing only the utility classes you use.
 */

import tailwindcss from 'bun-plugin-tailwind';
import type { BuildPhase, BuildContext, BuildConfig } from '@agentuity/cli';

export default function config(phase: BuildPhase, context: BuildContext): BuildConfig {
	// Enable Tailwind CSS for web builds
	if (phase === 'web') {
		return {
			plugins: [tailwindcss],
		};
	}

	return {};
}
