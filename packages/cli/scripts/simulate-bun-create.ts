#!/usr/bin/env bun
/**
 * Simulate bun create flow for local testing
 *
 * This script replicates what `bun create agentuity` does but works
 * within the monorepo so we can test end-to-end without publishing
 *
 * Usage: bun scripts/simulate-bun-create.ts <project-name> [target-dir]
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';

const projectName = process.argv[2];
const targetBaseDir = process.argv[3] || process.cwd();

if (!projectName) {
	console.error('Usage: bun scripts/simulate-bun-create.ts <project-name> [target-dir]');
	process.exit(1);
}

const monorepoRoot = join(import.meta.dir, '../../..');
const templateDir = join(monorepoRoot, 'apps/create-agentuity');
const targetDir = join(targetBaseDir, projectName);

// Ensure target is within monorepo for workspace resolution to work
const isWithinMonorepo = targetBaseDir.startsWith(monorepoRoot);
if (!isWithinMonorepo) {
	console.error('❌ Error: Target directory must be within the monorepo');
	console.error(`   Monorepo root: ${monorepoRoot}`);
	console.error(`   Target: ${targetBaseDir}\n`);
	console.error('   Suggestion: Create in /tmp within monorepo or use apps/ directory\n');
	process.exit(1);
}

console.log('🔧 Simulating bun create flow...\n');
console.log(`  Template:  ${templateDir}`);
console.log(`  Target:    ${targetDir}\n`);

// 1. Check if target exists
if (existsSync(targetDir)) {
	console.error(`❌ Error: Directory ${targetDir} already exists`);
	console.error('   Remove it first or choose a different name\n');
	process.exit(1);
}

// 2. Copy template files (excluding node_modules, .agentuity, dist, .git)
console.log('📦 Copying template files...');
await Bun.$`rsync -a --exclude='node_modules' --exclude='.agentuity' --exclude='dist' --exclude='.git' ${templateDir}/ ${targetDir}/`;
console.log('✓ Files copied\n');

// 3. Update package.json name to match project
console.log('🔧 Updating package.json...');
const packageJsonPath = join(targetDir, 'package.json');
const packageJson = await Bun.file(packageJsonPath).json();
packageJson.name = projectName;
await Bun.write(packageJsonPath, JSON.stringify(packageJson, null, '\t'));
console.log('✓ Package name updated\n');

// 4. Initialize git
console.log('🔧 Initializing git repository...');
await Bun.$`cd ${targetDir} && git init`.quiet();
console.log('✓ Git initialized\n');

// 5. Run bun install (file: deps will resolve to monorepo packages)
console.log('📦 Installing dependencies...');
const installProc = Bun.spawn(['bun', 'install'], {
	cwd: targetDir,
	stdout: 'inherit',
	stderr: 'inherit',
});
await installProc.exited;

if (installProc.exitCode !== 0) {
	console.error('\n❌ bun install failed\n');
	process.exit(1);
}
console.log('✓ Dependencies installed\n');

// 6. Run postinstall hooks manually (simulating bun-create behavior)
const updatedPackageJson = await Bun.file(packageJsonPath).json();

if (updatedPackageJson['bun-create']?.postinstall) {
	const postinstallCommands = Array.isArray(updatedPackageJson['bun-create'].postinstall)
		? updatedPackageJson['bun-create'].postinstall
		: [updatedPackageJson['bun-create'].postinstall];

	console.log('🔧 Running postinstall hooks...\n');

	for (const command of postinstallCommands) {
		console.log(`  Running: ${command}`);
		const proc = Bun.spawn(['sh', '-c', command], {
			cwd: targetDir,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			console.error(`\n❌ Postinstall command failed: ${command}\n`);
			process.exit(1);
		}
	}

	console.log('\n✓ Postinstall hooks completed\n');
}

// 6. Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✨ Project created successfully!\n');
console.log('  Next steps:');
console.log(`    cd ${projectName}`);
console.log('    bun run dev\n');
console.log(`  Visit http://localhost:3000\n`);
