/**
 * Browser-launching helper.
 *
 * Centralizes the "open this URL in the user's default browser"
 * pattern that previously lived inline in three different files
 * (`cmd/auth/login.ts`, `cmd/git/account/add.ts`,
 * `cmd/git/identity/connect.ts`).
 *
 * The implementation forks per-platform:
 *
 *   - **macOS** uses `open <url>`. `open` is the standard Apple
 *     utility for handing a path or URL to the appropriate
 *     application. Always present.
 *   - **Linux / *BSD** use `xdg-open <url>`. `xdg-open` ships with
 *     all major desktop environments. May be missing on minimal
 *     server installs; we fail silently in that case (the caller's
 *     fallback is to log the URL for the user to copy manually).
 *   - **Windows** uses `cmd /c start "" <url>`. `start` is a `cmd.exe`
 *     builtin, not a standalone executable, so it must be invoked
 *     through `cmd /c`. The empty `""` is the required window-title
 *     argument; without it `start` interprets the URL as the title
 *     and fails to open anything.
 *
 * The spawn is detached and stdio-ignored: we never wait for the
 * browser to finish. `spawnDetached()` returns immediately, and the
 * child runs in its own process group so the user can `Ctrl+C`
 * `agentuity` without killing their browser.
 */

import { spawnDetached } from '../node-compat/proc.ts';

/**
 * Open `url` in the user's default browser.
 *
 * Errors are swallowed: if the platform-appropriate launcher is not
 * available (e.g. headless Linux without `xdg-open`), the function
 * simply returns. Callers should always show the URL to the user
 * even if `openInBrowser` was invoked, so that the user has a
 * fallback path.
 */
export function openInBrowser(url: string): void {
	try {
		if (process.platform === 'win32') {
			// `cmd /c start "" <url>` — see module docstring.
			spawnDetached({ cmd: ['cmd', '/c', 'start', '', url] });
			return;
		}
		const launcher = process.platform === 'darwin' ? 'open' : 'xdg-open';
		spawnDetached({ cmd: [launcher, url] });
	} catch {
		// Best-effort: the caller's UI already shows the URL, so we
		// don't need to surface this.
	}
}
