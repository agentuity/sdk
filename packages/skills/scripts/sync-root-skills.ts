#!/usr/bin/env bun
/**
 * Sync canonical skills from packages/skills/skills/ to repo-root skills/
 * for Git-based installs via `npx skills add agentuity/sdk`.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dir, '..');
const sourceDir = join(packageRoot, 'skills');
const repoRoot = resolve(packageRoot, '../..');
const targetDir = join(repoRoot, 'skills');

if (!existsSync(sourceDir)) {
	console.error(`Source skills directory not found: ${sourceDir}`);
	process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const preserveFiles = new Set(['README.md']);

for (const entry of readdirSync(targetDir)) {
	if (preserveFiles.has(entry)) continue;
	const entryPath = join(targetDir, entry);
	rmSync(entryPath, { recursive: true, force: true });
}

for (const skillName of readdirSync(sourceDir)) {
	const from = join(sourceDir, skillName);
	const to = join(targetDir, skillName);
	cpSync(from, to, { recursive: true });
}

console.log(`Synced skills from ${sourceDir} to ${targetDir}`);
