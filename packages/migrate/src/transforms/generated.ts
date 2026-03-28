/**
 * Transform: delete src/generated/
 *
 * The generated directory is 100% CLI-managed in v1.  In v2 it is gone.
 */

import { rmSync } from 'node:fs';

export function deleteGeneratedDir(generatedDir: string): void {
	rmSync(generatedDir, { recursive: true, force: true });
}
