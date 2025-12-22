/**
 * File Watcher for Dev Server Hot Reload
 *
 * Watches source files and triggers server restart on changes.
 * Handles both backend (API, agents, lib) and generates restart signals.
 */

import { watch, type FSWatcher, statSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, basename, relative } from 'node:path';
import type { Logger } from '../../types';
import { createAgentTemplates, createAPITemplates } from './templates';

export interface FileWatcherOptions {
	rootDir: string;
	logger: Logger;
	onRestart: () => void;
	additionalPaths?: string[];
}

export interface FileWatcherManager {
	start: () => void;
	stop: () => void;
	pause: () => void;
	resume: () => void;
}

/**
 * Create a file watcher manager for hot reload
 */
export function createFileWatcher(options: FileWatcherOptions): FileWatcherManager {
	const { rootDir, logger, onRestart, additionalPaths = [] } = options;

	const watchers: FSWatcher[] = [];
	let paused = false;
	let buildCooldownTimer: NodeJS.Timeout | null = null;

	// Directories to ignore - these are NEVER traversed into
	// This prevents EMFILE errors from symlink cycles in node_modules
	const ignoreDirs = new Set([
		'.agentuity',
		'.agents',
		'.claude',
		'.code',
		'.opencode',
		'node_modules',
		'.git',
		'dist',
		'build',
		'.next',
		'.turbo',
	]);

	// Paths to ignore for file change events (but may still be traversed)
	const ignorePaths = [
		'.agentuity',
		'.agents',
		'.claude',
		'.code',
		'.opencode',
		'node_modules',
		'.git',
		'dist',
		'build',
		'.next',
		'.turbo',
		'src/web', // Vite handles frontend with HMR - no backend restart needed
	];

	/**
	 * Check if a path should be ignored
	 */
	function shouldIgnorePath(changedFile: string | null, watchDir: string): boolean {
		if (!changedFile) return false;

		const absPath = resolve(watchDir, changedFile);

		// Check against ignore list - match both relative path and absolute path
		for (const ignorePath of ignorePaths) {
			// Check relative path from watchDir
			if (
				changedFile === ignorePath ||
				changedFile.startsWith(`${ignorePath}/`) ||
				changedFile.startsWith(`${ignorePath}\\`)
			) {
				logger.trace('File change ignored (%s): %s', ignorePath, changedFile);
				return true;
			}

			// Check if absolute path contains the ignore pattern
			const ignoreAbsPath = resolve(rootDir, ignorePath);
			if (
				absPath === ignoreAbsPath ||
				absPath.startsWith(`${ignoreAbsPath}/`) ||
				absPath.startsWith(`${ignoreAbsPath}\\`)
			) {
				logger.trace('File change ignored (%s): %s', ignorePath, changedFile);
				return true;
			}

			// Also check if changedFile path includes the ignore pattern anywhere
			// This handles cases like "some/path/.agentuity/file.js"
			const normalizedChanged = changedFile.replace(/\\/g, '/');
			const normalizedIgnore = ignorePath.replace(/\\/g, '/');
			if (
				normalizedChanged.includes(`/${normalizedIgnore}/`) ||
				normalizedChanged.includes(`/${normalizedIgnore}`)
			) {
				logger.trace('File change ignored (%s in path): %s', ignorePath, changedFile);
				return true;
			}
		}

		// Ignore temp files from editors
		if (changedFile.match(/\.(tmp|swp|swo|swx)$|~$/)) {
			logger.trace('File change ignored (temp file): %s', changedFile);
			return true;
		}

		// Ignore hidden files (except .env)
		if (changedFile.startsWith('.') && !changedFile.startsWith('.env')) {
			logger.trace('File change ignored (hidden file): %s', changedFile);
			return true;
		}

		return false;
	}

	/**
	 * Handle file change event
	 */
	function handleFileChange(eventType: string, changedFile: string | null, watchDir: string) {
		if (paused) {
			logger.trace('File change ignored (watcher paused): %s', changedFile);
			return;
		}

		if (shouldIgnorePath(changedFile, watchDir)) {
			return;
		}

		// During build cooldown, ignore changes (they're likely build outputs)
		if (buildCooldownTimer) {
			logger.trace('File change ignored (build cooldown): %s', changedFile);
			return;
		}

		// Check if an empty directory was created in src/agent/ or src/api/
		// This helps with developer experience by auto-scaffolding template files
		if (changedFile && eventType === 'rename') {
			try {
				const absPath = resolve(watchDir, changedFile);
				// Normalize the path for comparison (use forward slashes)
				const normalizedPath = changedFile.replace(/\\/g, '/');

				// Check if it's a directory and empty
				const stats = statSync(absPath);
				if (stats.isDirectory()) {
					const contents = readdirSync(absPath);
					if (contents.length === 0) {
						// Check if this is an agent or API directory
						if (
							normalizedPath.startsWith('src/agent/') ||
							normalizedPath.includes('/src/agent/')
						) {
							logger.debug('Agent directory created: %s', changedFile);
							createAgentTemplates(absPath);
						} else if (
							normalizedPath.startsWith('src/api/') ||
							normalizedPath.includes('/src/api/')
						) {
							logger.debug('API directory created: %s', changedFile);
							createAPITemplates(absPath);
						}
					}
				}
			} catch (error) {
				// File might have been deleted or doesn't exist yet - this is normal
				logger.trace('Unable to check directory for template creation: %s', error);
			}
		}

		logger.debug('File changed (%s): %s', eventType, changedFile || watchDir);
		onRestart();
	}

	/**
	 * Recursively collect all directories to watch, skipping ignored directories.
	 * This prevents EMFILE errors from symlink cycles in node_modules.
	 */
	function collectWatchDirs(dir: string, visited: Set<string> = new Set()): string[] {
		const dirs: string[] = [dir];

		try {
			// Use lstat to check for symlinks - get the real path to detect cycles
			const stat = lstatSync(dir);

			// Skip symlinks to prevent following circular symlinks
			if (stat.isSymbolicLink()) {
				logger.trace('Skipping symlink: %s', dir);
				return [];
			}

			// Track visited inodes to detect cycles
			const key = `${stat.dev}:${stat.ino}`;
			if (visited.has(key)) {
				logger.trace('Skipping already visited directory (cycle detected): %s', dir);
				return [];
			}
			visited.add(key);

			const entries = readdirSync(dir, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				const name = entry.name;

				// Skip ignored directories entirely - this is the key fix
				if (ignoreDirs.has(name)) {
					logger.trace('Skipping ignored directory: %s', resolve(dir, name));
					continue;
				}

				// Skip hidden directories (except specific ones like .env folders)
				if (name.startsWith('.')) {
					logger.trace('Skipping hidden directory: %s', resolve(dir, name));
					continue;
				}

				const fullPath = resolve(dir, name);
				dirs.push(...collectWatchDirs(fullPath, visited));
			}
		} catch (error) {
			logger.trace('Error reading directory %s: %s', dir, error);
		}

		return dirs;
	}

	/**
	 * Start watching files
	 */
	function start() {
		logger.debug('Starting file watchers for hot reload...');

		// Collect all directories to watch, excluding node_modules and other ignored dirs
		const allDirs = collectWatchDirs(rootDir);

		// Add additional paths
		if (additionalPaths && additionalPaths.length > 0) {
			for (const additionalPath of additionalPaths) {
				const fullPath = resolve(rootDir, additionalPath);
				allDirs.push(...collectWatchDirs(fullPath));
			}
		}

		// De-duplicate directories
		const uniqueDirs = [...new Set(allDirs)];

		logger.debug('Collected %d directories to watch', uniqueDirs.length);

		// Watch each directory non-recursively
		for (const watchPath of uniqueDirs) {
			try {
				// Use non-recursive watch to avoid traversing into node_modules
				const watcher = watch(watchPath, { recursive: false }, (eventType, changedFile) => {
					// Construct relative path from rootDir for consistent handling
					const relPath = changedFile
						? relative(rootDir, resolve(watchPath, changedFile))
						: relative(rootDir, watchPath);
					handleFileChange(eventType, relPath || changedFile, rootDir);
				});

				watchers.push(watcher);
			} catch (error) {
				logger.trace('Failed to start watcher for %s: %s', watchPath, error);
			}
		}

		logger.debug('File watchers started (%d directories)', watchers.length);
	}

	/**
	 * Stop all watchers
	 */
	function stop() {
		logger.debug('Stopping file watchers...');

		for (const watcher of watchers) {
			try {
				watcher.close();
			} catch (error) {
				logger.trace('Error closing watcher: %s', error);
			}
		}

		watchers.length = 0;

		if (buildCooldownTimer) {
			clearTimeout(buildCooldownTimer);
			buildCooldownTimer = null;
		}

		logger.debug('File watchers stopped');
	}

	/**
	 * Temporarily pause watching (e.g., during build)
	 */
	function pause() {
		paused = true;
		logger.trace('File watchers paused');

		// Set cooldown timer to ignore changes for a bit after build
		if (buildCooldownTimer) {
			clearTimeout(buildCooldownTimer);
		}

		buildCooldownTimer = setTimeout(() => {
			buildCooldownTimer = null;
			logger.trace('Build cooldown expired');
		}, 500); // 500ms cooldown
	}

	/**
	 * Resume watching
	 */
	function resume() {
		paused = false;
		logger.trace('File watchers resumed');
	}

	return {
		start,
		stop,
		pause,
		resume,
	};
}
