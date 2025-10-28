#!/usr/bin/env bun
/**
 * Setup script for local development template testing
 *
 * This script:
 * 1. Links all @agentuity packages globally via bun link
 * 2. Creates ~/.bun-create/agentuity-dev directory
 * 3. Copies the template from apps/create-agentuity
 *
 * The template keeps workspace:* dependencies which resolve via global links
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const homeDir = homedir();
const bunCreateDir = join(homeDir, '.bun-create');
const devTemplateName = 'agentuity-dev';
const devTemplateDir = join(bunCreateDir, devTemplateName);
const sourceTemplateDir = join(import.meta.dir, '../../../apps/create-agentuity');

console.log('🔧 Setting up local dev template for testing...\n');

// 1. Link all @agentuity packages globally so bun install can find them
console.log('Linking @agentuity packages globally...');
const monorepoRoot = join(import.meta.dir, '../../..');
const packagesToLink = ['cli', 'core', 'react', 'runtime', 'server'];

for (const pkg of packagesToLink) {
	const pkgDir = join(monorepoRoot, 'packages', pkg);
	await Bun.$`cd ${pkgDir} && bun link`.quiet();
	console.log(`  ✓ Linked @agentuity/${pkg}`);
}
console.log('✓ All packages linked globally\n');

// 2. Create .bun-create directory if it doesn't exist
if (!existsSync(bunCreateDir)) {
	console.log(`Creating ${bunCreateDir}...`);
	await Bun.$`mkdir -p ${bunCreateDir}`;
}

// 3. Remove existing dev template if it exists
if (existsSync(devTemplateDir)) {
	console.log(`Removing existing ${devTemplateDir}...`);
	await Bun.$`rm -rf ${devTemplateDir}`;
}

// 4. Create dev template directory
console.log(`Creating ${devTemplateDir}...`);
await Bun.$`mkdir -p ${devTemplateDir}`;

// 5. Copy template files (excluding node_modules, .agentuity, etc.)
console.log(`Copying template files from ${sourceTemplateDir}...`);
await Bun.$`rsync -av --exclude='node_modules' --exclude='.agentuity' --exclude='dist' ${sourceTemplateDir}/ ${devTemplateDir}/`;

// 6. Update package.json to add preinstall hook and convert workspace:* to versions
const packageJsonPath = join(devTemplateDir, 'package.json');
const packageJsonFile = Bun.file(packageJsonPath);
const packageJson = await packageJsonFile.json();

// Replace workspace:* with version numbers
const packagesWithVersions = ['cli', 'core', 'react', 'runtime'];
if (packageJson.dependencies) {
	for (const pkg of packagesWithVersions) {
		if (packageJson.dependencies[`@agentuity/${pkg}`] === 'workspace:*') {
			packageJson.dependencies[`@agentuity/${pkg}`] = '^0.0.5';
		}
	}
}
if (packageJson.devDependencies) {
	for (const pkg of packagesWithVersions) {
		if (packageJson.devDependencies[`@agentuity/${pkg}`] === 'workspace:*') {
			packageJson.devDependencies[`@agentuity/${pkg}`] = '^0.0.5';
		}
	}
}

// Add preinstall hook to link packages before bun install runs
if (packageJson['bun-create']) {
	const linkCommands = packagesWithVersions
		.map((pkg) => `bun link @agentuity/${pkg}`)
		.join(' && ');
	packageJson['bun-create'].preinstall = linkCommands;
}

await Bun.write(packageJsonPath, JSON.stringify(packageJson, null, '\t'));
console.log('✓ Added preinstall hook to link packages before install');

console.log(`\n✅ Dev template setup complete!`);
console.log(`\nTemplate location: ${devTemplateDir}`);
console.log(`\nYou can now test with:`);
console.log(`  bun ${join(import.meta.dir, '../bin/cli.ts')} create --name "Test Project" --dev`);
console.log(`\nOr directly with bun create:`);
console.log(`  cd /tmp && bun create ${devTemplateName} my-test-project`);
console.log(
	`\n📝 Note: All @agentuity packages are linked globally and will be used by the template\n`
);
