import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { readdir, realpath } from 'node:fs/promises';
import type { LoadedSkill, SkillMetadata, SkillScope, SkillsConfig } from './types';
import { parseFrontmatter } from './frontmatter';

const SKILL_FILENAME = 'SKILL.md';

interface SkillDirConfig {
	dir: string;
	scope: SkillScope;
}

/**
 * Load skills from standard directories.
 * Priority order (later overrides earlier):
 * 1. User OpenCode: ~/.config/opencode/skills/
 * 2. User Agentuity: ~/.config/agentuity/opencode/skills/
 * 3. User Claude Code compat: ~/.claude/skills/
 * 4. Project OpenCode: ./.opencode/skills/
 * 5. Project Claude Code compat: ./.claude/skills/
 */
export async function loadAllSkills(config?: SkillsConfig): Promise<LoadedSkill[]> {
	if (config?.enabled === false) {
		return [];
	}

	const skillDirs: SkillDirConfig[] = [
		{ dir: join(homedir(), '.config', 'opencode', 'skills'), scope: 'user' },
		{ dir: join(homedir(), '.config', 'agentuity', 'opencode', 'skills'), scope: 'user' },
		{ dir: join(homedir(), '.claude', 'skills'), scope: 'user' },
		{ dir: join(process.cwd(), '.opencode', 'skills'), scope: 'project' },
		{ dir: join(process.cwd(), '.claude', 'skills'), scope: 'project' },
	];

	if (config?.paths?.length) {
		for (const skillPath of config.paths) {
			const resolvedPath = resolve(skillPath);
			skillDirs.push({ dir: resolvedPath, scope: inferScope(resolvedPath) });
		}
	}

	const disabled = new Set(config?.disabled ?? []);
	const skillsByName = new Map<string, LoadedSkill>();

	for (const { dir, scope } of skillDirs) {
		const skills = await loadSkillsFromDir(dir, scope);
		for (const skill of skills) {
			if (disabled.has(skill.name)) {
				continue;
			}
			skillsByName.set(skill.name, skill);
		}
	}

	return Array.from(skillsByName.values());
}

/**
 * Load skills from a single directory
 */
export async function loadSkillsFromDir(dir: string, scope: SkillScope): Promise<LoadedSkill[]> {
	const results: LoadedSkill[] = [];
	const resolvedDir = await safeRealpath(dir);

	let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
	try {
		entries = await readdir(resolvedDir, { withFileTypes: true });
	} catch {
		return results;
	}

	for (const entry of entries) {
		if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			const skillPath = join(dir, entry.name);
			const skill = await loadSkillFromPath(
				skillPath,
				resolvedDir,
				basename(entry.name, '.md'),
				scope
			);
			if (skill) {
				results.push(skill);
			}
			continue;
		}

		if (entry.isDirectory()) {
			const subdirPath = join(dir, entry.name);
			const resolvedSubdir = await safeRealpath(subdirPath);
			const candidates = [
				join(subdirPath, SKILL_FILENAME),
				join(subdirPath, `${entry.name}.md`),
			];

			for (const candidate of candidates) {
				const skill = await loadSkillFromPath(candidate, resolvedSubdir, entry.name, scope);
				if (skill) {
					results.push(skill);
					break;
				}
			}
		}
	}

	return results;
}

/**
 * Load a single skill file (supports both .md files and SKILL.md in directories)
 */
async function loadSkillFromPath(
	skillPath: string,
	resolvedPath: string,
	defaultName: string,
	scope: SkillScope
): Promise<LoadedSkill | null> {
	const file = Bun.file(skillPath);
	if (!(await file.exists())) {
		return null;
	}

	const content = await file.text();
	const parsed = parseFrontmatter<SkillMetadata>(content);
	const metadata = parsed.data ?? {};
	const name = metadata.name?.trim() || defaultName;
	if (!name) {
		return null;
	}

	const allowedTools = normalizeAllowedTools(metadata['allowed-tools']);

	return {
		name,
		path: skillPath,
		resolvedPath,
		content: parsed.body,
		metadata,
		scope,
		...(allowedTools ? { allowedTools } : {}),
	};
}

/**
 * Get skill by name from loaded skills
 */
export function getSkillByName(skills: LoadedSkill[], name: string): LoadedSkill | undefined {
	return skills.find((skill) => skill.name === name);
}

function normalizeAllowedTools(value?: string | string[]): string[] | undefined {
	if (!value) return undefined;
	if (Array.isArray(value)) {
		const tools = value.filter((tool) => typeof tool === 'string');
		return tools.length > 0 ? tools : undefined;
	}
	if (typeof value === 'string') {
		const tool = value.trim();
		return tool ? [tool] : undefined;
	}
	return undefined;
}

function inferScope(skillPath: string): SkillScope {
	const resolved = resolve(skillPath);
	const cwd = resolve(process.cwd());
	const home = resolve(homedir());

	if (isWithin(cwd, resolved)) return 'project';
	if (isWithin(home, resolved)) return 'user';
	return 'opencode';
}

function isWithin(base: string, target: string): boolean {
	const baseWithSep = base.endsWith(sep) ? base : `${base}${sep}`;
	return target === base || target.startsWith(baseWithSep);
}

async function safeRealpath(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return path;
	}
}
