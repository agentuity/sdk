import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'yaml';
import { getVersion } from '../version.ts';
import {
	SKILLS_GITIGNORE_ENTRIES,
	SKILLS_NPM_CONFIG_CONTENT,
	SKILLS_NPM_CONFIG_FILE,
	SKILLS_NPM_PREPARE_COMMAND,
	SKILLS_NPM_VERSION,
	SKILLS_PACKAGE,
} from './constants.ts';

interface PackageJson {
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

export interface WireSkillsOptions {
	/** Project directory containing package.json */
	projectDir: string;
	/** Pin @agentuity/skills to this version (defaults to CLI version) */
	skillsVersion?: string;
	/** Write skills-npm.config.ts if missing */
	writeConfig?: boolean;
	/** Append gitignore entries */
	updateGitignore?: boolean;
}

export interface WireSkillsResult {
	changed: boolean;
	alreadyConfigured: boolean;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return {};
	try {
		const data = yaml.parse(match[1] ?? '') as { name?: string; description?: string };
		return data ?? {};
	} catch {
		return {};
	}
}

export function isSkillsConfigured(pkg: PackageJson): boolean {
	const prepare = pkg.scripts?.prepare ?? '';
	return prepare.includes('skills-npm');
}

export function mergePrepareScript(scripts: Record<string, string>): boolean {
	const existing = scripts.prepare ?? '';
	if (existing.includes('skills-npm')) {
		return false;
	}
	scripts.prepare = existing
		? `${existing} && ${SKILLS_NPM_PREPARE_COMMAND}`
		: SKILLS_NPM_PREPARE_COMMAND;
	return true;
}

export async function appendSkillsGitignore(projectDir: string): Promise<boolean> {
	const gitignorePath = join(projectDir, '.gitignore');
	let content = '';
	if (existsSync(gitignorePath)) {
		content = await readFile(gitignorePath, 'utf-8');
	}

	const missing = SKILLS_GITIGNORE_ENTRIES.filter((entry) => !content.includes(entry));
	if (missing.length === 0) {
		return false;
	}

	const section = '\n# skills-npm symlinks\n' + missing.join('\n') + '\n';
	await writeFile(gitignorePath, content.trimEnd() + section);
	return true;
}

/**
 * Add @agentuity/skills and skills-npm to package.json, prepare script, gitignore, and config.
 */
export async function wireSkillsToProject(options: WireSkillsOptions): Promise<WireSkillsResult> {
	const {
		projectDir,
		skillsVersion = getVersion(),
		writeConfig = true,
		updateGitignore = true,
	} = options;

	const pkgPath = join(projectDir, 'package.json');
	if (!existsSync(pkgPath)) {
		throw new Error(`No package.json found in ${projectDir}`);
	}

	const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as PackageJson;
	const alreadyConfigured = isSkillsConfigured(pkg);

	pkg.devDependencies = pkg.devDependencies ?? {};
	pkg.scripts = pkg.scripts ?? {};

	let changed = false;

	if (pkg.devDependencies[SKILLS_PACKAGE] !== skillsVersion) {
		pkg.devDependencies[SKILLS_PACKAGE] = skillsVersion;
		changed = true;
	}

	if (pkg.devDependencies['skills-npm'] !== SKILLS_NPM_VERSION) {
		pkg.devDependencies['skills-npm'] = SKILLS_NPM_VERSION;
		changed = true;
	}

	if (mergePrepareScript(pkg.scripts)) {
		changed = true;
	}

	if (changed) {
		await writeFile(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
	}

	if (writeConfig) {
		const configPath = join(projectDir, SKILLS_NPM_CONFIG_FILE);
		if (!existsSync(configPath)) {
			await writeFile(configPath, SKILLS_NPM_CONFIG_CONTENT);
			changed = true;
		}
	}

	if (updateGitignore) {
		const gitignoreChanged = await appendSkillsGitignore(projectDir);
		changed = changed || gitignoreChanged;
	}

	return { changed, alreadyConfigured };
}

export interface BundledSkillInfo {
	name: string;
	description?: string;
	directory: string;
}

export async function listBundledSkills(projectDir: string): Promise<BundledSkillInfo[]> {
	const skillsRoot = join(projectDir, 'node_modules', SKILLS_PACKAGE, 'skills');
	if (!existsSync(skillsRoot)) {
		return [];
	}

	const entries = await readdir(skillsRoot, { withFileTypes: true });
	const skills: BundledSkillInfo[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const skillPath = join(skillsRoot, entry.name, 'SKILL.md');
		if (!existsSync(skillPath)) continue;

		const content = await readFile(skillPath, 'utf-8');
		const meta = parseFrontmatter(content);
		skills.push({
			name: meta.name ?? entry.name,
			description: meta.description,
			directory: entry.name,
		});
	}

	return skills.sort((a, b) => a.name.localeCompare(b.name));
}
