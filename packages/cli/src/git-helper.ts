/**
 * Git helper utilities for detecting and using git safely.
 * 
 * On macOS, git may be a stub that triggers Xcode Command Line Tools installation popup.
 * This helper detects the real git binary and provides safe wrappers.
 */

/**
 * Check if git is available and is the real git binary (not the macOS stub).
 * 
 * On macOS without Xcode CLT installed, /usr/bin/git exists but it's a stub that
 * triggers a popup asking to install developer tools. We detect this by checking
 * if Xcode Command Line Tools are installed using `xcode-select -p`.
 * 
 * @returns true if git is available and functional, false otherwise
 */
export async function isGitAvailable(): Promise<boolean> {
	const gitPath = Bun.which('git');
	if (!gitPath) {
		return false;
	}

	// On macOS, check if Xcode Command Line Tools are installed
	// xcode-select -p returns 0 if tools are installed, non-zero otherwise
	if (process.platform === 'darwin') {
		try {
			const result = Bun.spawnSync(['xcode-select', '-p'], {
				stdout: 'pipe',
				stderr: 'pipe',
			});
			
			// If xcode-select -p fails, CLT are not installed, git is just a stub
			if (result.exitCode !== 0) {
				return false;
			}
		} catch {
			// xcode-select not found or error - assume git is not available
			return false;
		}
	}

	// On other platforms, just verify git works
	try {
		const result = Bun.spawnSync(['git', '--version'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * Get the default branch name from git config, or 'main' as fallback.
 * Returns null if git is not available.
 */
export async function getDefaultBranch(): Promise<string | null> {
	if (!(await isGitAvailable())) {
		return null;
	}

	try {
		const result = Bun.spawnSync(['git', 'config', '--global', 'init.defaultBranch']);
		if (result.exitCode === 0) {
			const branch = result.stdout.toString().trim();
			return branch || 'main';
		}
	} catch {
		// Ignore errors
	}

	return 'main';
}
