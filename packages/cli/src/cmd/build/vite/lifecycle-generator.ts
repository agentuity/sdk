/**
 * Lifecycle Types Generator
 *
 * Generates .agentuity/lifecycle.generated.d.ts by analyzing app.ts for setup() function
 */

import { join } from 'node:path';
import { generateLifecycleTypes as generateLifecycleTypesFromAST } from '../ast';
import type { Logger } from '../../../types';

/**
 * Setup lifecycle types by analyzing app.ts for setup() function
 */
export async function generateLifecycleTypes(
	rootDir: string,
	srcDir: string,
	logger: Logger
): Promise<boolean> {
	const outDir = join(rootDir, '.agentuity');

	// Look for app.ts in both root and src directories
	const rootAppFile = join(rootDir, 'app.ts');
	const srcAppFile = join(srcDir, 'app.ts');

	let appFile = '';
	if (await Bun.file(rootAppFile).exists()) {
		appFile = rootAppFile;
	} else if (await Bun.file(srcAppFile).exists()) {
		appFile = srcAppFile;
	}

	if (!appFile || !(await Bun.file(appFile).exists())) {
		logger.trace('No app.ts found for lifecycle types generation');
		return false;
	}

	try {
		return await generateLifecycleTypesFromAST(rootDir, outDir, appFile);
	} catch (error) {
		logger.error('Failed to generate lifecycle types:', error);
		return false;
	}
}
