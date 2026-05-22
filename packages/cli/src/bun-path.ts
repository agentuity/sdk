import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from './node-compat/fs.ts';
import { which } from './node-compat/which.ts';

/**
 * Ensures bun is available on PATH by checking common install
 * locations. If bun is not on PATH but exists in `$HOME/.bun/bin`,
 * adds it to `process.env.PATH`.
 *
 * This handles the case where the install script installs bun to
 * `$HOME/.bun/bin` but the user hasn't restarted their shell yet, so
 * it's not on PATH.
 *
 * Under Node we still run the same fallback path-fixup so that
 * commands invoking Bun-built tooling (e.g. `bun run build` for
 * scaffolded user projects) work even if the user is running the
 * CLI itself under Node.
 */
export async function ensureBunOnPath(): Promise<void> {
	// Check if bun is already on PATH (works under both runtimes)
	if (await which('bun')) {
		return;
	}

	// Check $HOME/.bun/bin. Bun's installer drops a `bun` binary on
	// POSIX and `bun.exe` on Windows.
	const bunBinDir = join(homedir(), '.bun', 'bin');
	const candidates =
		process.platform === 'win32' ? [join(bunBinDir, 'bun.exe')] : [join(bunBinDir, 'bun')];

	for (const bunPath of candidates) {
		if (await pathExists(bunPath)) {
			const pathSep = process.platform === 'win32' ? ';' : ':';
			process.env.PATH = process.env.PATH
				? `${bunBinDir}${pathSep}${process.env.PATH}`
				: bunBinDir;
			return;
		}
	}
}
