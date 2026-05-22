/**
 * `which` — locate an executable on `PATH`.
 *
 * Replacement for `Bun.which(cmd)`. Walks the directories in `PATH`,
 * returning the first executable match, or `null` when not found.
 *
 * Honors Windows's `PATHEXT` (semicolon-delimited list of executable
 * suffixes like `.EXE;.CMD;.BAT`) so callers can pass `git` and
 * receive `C:\\Program Files\\Git\\cmd\\git.exe` on Windows.
 *
 * Designed for the CLI's needs: synchronous-looking call sites that
 * just want a yes/no on "is this binary installed?" or the absolute
 * path. Not a general-purpose `which` (no `-a` semantics, no
 * symlink resolution, no shadowing reports).
 */

import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

const isWindows = process.platform === 'win32';

/**
 * Returns the absolute path to `command` if found on `PATH`, or
 * `null` if no matching executable is reachable.
 */
export async function which(command: string): Promise<string | null> {
	if (!command) return null;

	// Absolute path or path with separators? Treat as a literal path
	// and just check executability.
	if (command.includes('/') || (isWindows && command.includes('\\'))) {
		return (await isExecutable(command)) ? command : null;
	}

	const pathEnv = process.env.PATH ?? '';
	const dirs = pathEnv.split(delimiter).filter(Boolean);
	const exts = isWindows
		? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)]
		: [''];

	for (const dir of dirs) {
		for (const ext of exts) {
			const candidate = join(dir, `${command}${ext}`);
			if (await isExecutable(candidate)) return candidate;
		}
	}
	return null;
}

async function isExecutable(path: string): Promise<boolean> {
	try {
		// On Windows, `X_OK` is treated as `F_OK` by Node — checking
		// existence is enough since the `PATHEXT` filter already
		// restricted us to executable suffixes.
		await access(path, isWindows ? fsConstants.F_OK : fsConstants.X_OK);
		return true;
	} catch {
		return false;
	}
}
