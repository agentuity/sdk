/**
 * File Watcher for Dev Server Hot Reload
 *
 * Watches source files and triggers server restart on changes.
 * Handles both backend (API, agents, lib) and generates restart signals.
 */

import { watch, type FSWatcher, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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

	// Watch the entire root directory recursively
	// This is simpler and more reliable than watching individual paths
	const watchDirs = [rootDir];

	// Directories to ignore
	const ignorePaths = [
		'.agentuity',
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

		// Check if an empty directory was created in src/agents/ or src/apis/
		if (changedFile && eventType === 'rename') {
			try {
				const absPath = resolve(watchDir, changedFile);
				if (statSync(absPath).isDirectory() && readdirSync(absPath).length === 0) {
					if (changedFile.startsWith('src/agents/')) {
						logger.debug('Agent directory created: %s', changedFile);
						createAgentTemplates(absPath);
					} else if (changedFile.startsWith('src/apis/')) {
						logger.debug('API directory created: %s', changedFile);
						createAPITemplates(absPath);
					}
				}
			} catch (error) {
				// File might have been deleted or doesn't exist yet
				logger.trace('Unable to check directory for template creation: %s', error);
			}
		}

		logger.debug('File changed (%s): %s', eventType, changedFile || watchDir);
		onRestart();
	}

	/**
	 * Start watching files
	 */
	function start() {
		logger.debug('Starting file watchers for hot reload...');

		// Watch root directory (already absolute path)
		for (const watchPath of watchDirs) {
			try {
				logger.trace('Setting up watcher for: %s', watchPath);

				const watcher = watch(watchPath, { recursive: true }, (eventType, changedFile) => {
					handleFileChange(eventType, changedFile, watchPath);
				});

				watchers.push(watcher);
				logger.trace('Watcher started for: %s', watchPath);
			} catch (error) {
				logger.warn('Failed to start watcher for %s: %s', watchPath, error);
			}
		}

		// Watch additional paths if provided
		if (additionalPaths && additionalPaths.length > 0) {
			for (const additionalPath of additionalPaths) {
				const fullPath = resolve(rootDir, additionalPath);
				try {
					logger.trace('Setting up watcher for additional path: %s', fullPath);

					const watcher = watch(fullPath, { recursive: true }, (eventType, changedFile) => {
						handleFileChange(eventType, changedFile, fullPath);
					});

					watchers.push(watcher);
					logger.trace('Watcher started for additional path: %s', fullPath);
				} catch (error) {
					logger.warn('Failed to start watcher for %s: %s', fullPath, error);
				}
			}
		}

		logger.debug('File watchers started (%d paths)', watchers.length);
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
