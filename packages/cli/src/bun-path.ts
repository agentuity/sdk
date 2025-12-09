import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Ensures bun is available on PATH by checking common install locations.
 * If bun is not on PATH but exists in $HOME/.bun/bin, adds it to process.env.PATH.
 *
 * This handles the case where the install script installs bun to $HOME/.bun/bin
 * but the user hasn't restarted their shell yet, so it's not on PATH.
 */
export async function ensureBunOnPath(): Promise<void> {
	// Check if bun is already on PATH
	if (Bun.which('bun')) {
		return;
	}

	// Check $HOME/.bun/bin
	const bunBinDir = join(homedir(), '.bun', 'bin');
	const bunPath = join(bunBinDir, 'bun');

	// Check if bun exists in $HOME/.bun/bin
	if (await Bun.file(bunPath).exists()) {
		// Add to PATH for this process
		process.env.PATH = `${bunBinDir}:${process.env.PATH}`;
	}
}
