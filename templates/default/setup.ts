#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { basename } from 'path';

const projectDir = process.cwd();
const projectName = basename(projectDir);

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
}

// Update README.md
const readmePath = 'README.md';
if (existsSync(readmePath)) {
	let readme = readFileSync(readmePath, 'utf-8');
	readme = readme.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
	writeFileSync(readmePath, readme);
}

// Update AGENTS.md
const agentsMdPath = 'AGENTS.md';
if (existsSync(agentsMdPath)) {
	let agentsMd = readFileSync(agentsMdPath, 'utf-8');
	agentsMd = agentsMd.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
	writeFileSync(agentsMdPath, agentsMd);
}

// Remove setup files
const filesToRemove = ['setup.ts'];
for (const file of filesToRemove) {
	if (existsSync(file)) {
		rmSync(file);
	}
}
