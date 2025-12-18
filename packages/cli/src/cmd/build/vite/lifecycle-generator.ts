/**
 * Lifecycle Types Generator
 *
 * Generates src/generated/lifecycle.d.ts by analyzing app.ts for setup() function
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
	logger.debug('[lifecycle] Starting lifecycle type generation...');
	logger.debug(`[lifecycle] rootDir: ${rootDir}`);
	logger.debug(`[lifecycle] srcDir: ${srcDir}`);

	const outDir = join(srcDir, 'generated');
	logger.debug(`[lifecycle] outDir: ${outDir}`);

	// Look for app.ts in both root and src directories
	const rootAppFile = join(rootDir, 'app.ts');
	const srcAppFile = join(srcDir, 'app.ts');

	let appFile = '';
	if (await Bun.file(rootAppFile).exists()) {
		appFile = rootAppFile;
		logger.debug(`[lifecycle] Found app.ts at root: ${rootAppFile}`);
	} else if (await Bun.file(srcAppFile).exists()) {
		appFile = srcAppFile;
		logger.debug(`[lifecycle] Found app.ts in src: ${srcAppFile}`);
	}

	if (!appFile || !(await Bun.file(appFile).exists())) {
		logger.debug('[lifecycle] No app.ts found for lifecycle types generation');
		return false;
	}

	try {
		logger.debug(`[lifecycle] Calling generateLifecycleTypesFromAST...`);
		const result = await generateLifecycleTypesFromAST(rootDir, outDir, appFile);
		if (result) {
			logger.debug(`[lifecycle] Lifecycle types generated successfully in ${outDir}`);
		} else {
			logger.debug('[lifecycle] generateLifecycleTypesFromAST returned false (no setup found)');
		}
		return result;
	} catch (error) {
		logger.error('[lifecycle] Failed to generate lifecycle types:', error);
		return false;
	}
}
