#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { basename } from 'path';

const projectDir = process.cwd();
const projectName = basename(projectDir);

console.log(`\n🔧 Setting up ${projectName}...\n`);

// Update package.json
const packageJsonPath = 'package.json';
if (existsSync(packageJsonPath)) {
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

	packageJson.name = projectName;
	delete packageJson['bun-create'];
	delete packageJson.bin;
	packageJson.private = true;
	delete packageJson.files;
	delete packageJson.keywords;
	delete packageJson.author;
	delete packageJson.license;
	delete packageJson.publishConfig;
	packageJson.description = undefined;

	// Remove enquirer from dependencies (only needed for setup)
	if (packageJson.dependencies) {
		delete packageJson.dependencies.enquirer;
	}

	writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, '\t'));
	console.log('✓ Updated package.json');
}

// Update README.md
const readmePath = 'README.md';
if (existsSync(readmePath)) {
	let readme = readFileSync(readmePath, 'utf-8');
	readme = readme.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
	writeFileSync(readmePath, readme);
	console.log('✓ Updated README.md');
}

// Update AGENTS.md
const agentsMdPath = 'AGENTS.md';
if (existsSync(agentsMdPath)) {
	let agentsMd = readFileSync(agentsMdPath, 'utf-8');
	agentsMd = agentsMd.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
	writeFileSync(agentsMdPath, agentsMd);
	console.log('✓ Updated AGENTS.md');
}

// Remove setup files
const filesToRemove = ['setup.ts'];
for (const file of filesToRemove) {
	if (existsSync(file)) {
		rmSync(file);
	}
}

console.log('\n✨ Setup complete!\n');
console.log(`   Next steps:`);
console.log(`   1. bun run build`);
console.log(`   2. bun run dev`);
console.log(`\n   Your app will be running at http://localhost:3000\n`);
