#!/usr/bin/env bun
/**
 * Pre-build check: Ensure legacy CLI is not installed
 * This prevents bunx from picking up the old CLI during builds
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

const homeDir = homedir();
const monorepoRoot = join(import.meta.dir, '..');

const legacyLocations = [
	'/opt/homebrew/bin/agentuity',
	'/usr/local/bin/agentuity',
	'/usr/bin/agentuity',
	join(homeDir, '.bin/agentuity'),
	join(homeDir, 'bin/agentuity'),
	join(homeDir, '.local/bin/agentuity'),
];

let foundLegacy = false;
const foundPaths: string[] = [];

// Check file system locations - any file at known locations is considered legacy
for (const location of legacyLocations) {
	const file = Bun.file(location);
	if (await file.exists()) {
		// Check if this is a symlink to our monorepo (created by bun link)
		let isOurLink = false;
		try {
			const proc = Bun.spawn(['readlink', '-f', location], { stdout: 'pipe', stderr: 'ignore' });
			const target = await new Response(proc.stdout).text();
			await proc.exited;

			if (target.trim().startsWith(monorepoRoot)) {
				isOurLink = true; // Skip our own linked package
			}
		} catch {
			// Not a symlink or readlink failed
		}

		if (!isOurLink) {
			foundLegacy = true;
			foundPaths.push(location);

			// Optional: probe file type for extra info (best-effort)
			try {
				const proc = Bun.spawn(['file', location], { stdout: 'pipe', stderr: 'ignore' });
				await proc.exited;
			} catch {
				// Ignore probe failures
			}
		}
	}
}

// Check Homebrew
try {
	const proc = Bun.spawn(['brew', 'list'], { stdout: 'pipe', stderr: 'ignore' });
	const output = await new Response(proc.stdout).text();
	await proc.exited;

	if (output.includes('agentuity')) {
		foundLegacy = true;
	}
} catch {
	// Ignore
}

// Check PATH for any agentuity command not already found
try {
	// Try command -v first, fallback to which
	const checkProc = Bun.spawn(['sh', '-c', 'command -v agentuity || which agentuity'], {
		stdout: 'pipe',
		stderr: 'ignore',
	});
	const pathOutput = await new Response(checkProc.stdout).text();
	await checkProc.exited;

	if (pathOutput.trim()) {
		const foundPath = pathOutput.trim();

		// Check if this points to our monorepo (skip our own linked package)
		let isOurLink = false;
		try {
			const proc = Bun.spawn(['readlink', '-f', foundPath], {
				stdout: 'pipe',
				stderr: 'ignore',
			});
			const target = await new Response(proc.stdout).text();
			await proc.exited;

			if (target.trim().startsWith(monorepoRoot)) {
				isOurLink = true;
			}
		} catch {
			// Not a symlink or readlink failed
		}

		// Only add if not already in our list and not our own link
		if (!isOurLink && !foundPaths.includes(foundPath)) {
			foundLegacy = true;
			foundPaths.push(foundPath);
		}
	}
} catch {
	// Ignore PATH check failures
}

if (foundLegacy) {
	console.error('\n❌ Legacy Agentuity CLI detected!\n');
	console.error('  The old CLI must be removed before building this monorepo.');
	console.error('  Otherwise bunx commands will pick up the wrong CLI.\n');

	if (foundPaths.length > 0) {
		console.error('  Found at:');
		for (const path of foundPaths) {
			console.error(`    - ${path}`);
		}
		console.error('');
	}

	console.error('  To remove:');
	console.error('    brew uninstall agentuity');
	console.error('');

	process.exit(1);
}
