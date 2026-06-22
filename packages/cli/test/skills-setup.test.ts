import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverCommands } from '../src/cmd';
import { SKILLS_NPM_CONFIG_CONTENT, SKILLS_PACKAGE } from '../src/skills/constants';
import { wireSkillsToProject } from '../src/skills/setup';

describe('skills setup', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'agentuity-skills-'));
		writeFileSync(
			join(dir, 'package.json'),
			JSON.stringify(
				{
					name: 'test-app',
					scripts: {
						prepare: 'husky',
					},
					devDependencies: {},
				},
				null,
				'\t'
			) + '\n'
		);
		writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('wires package dependencies, prepare hook, config, and gitignore entries', async () => {
		const result = await wireSkillsToProject({
			projectDir: dir,
			skillsVersion: '3.1.1',
		});

		expect(result.changed).toBe(true);
		expect(result.alreadyConfigured).toBe(false);

		const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
			devDependencies: Record<string, string>;
			scripts: Record<string, string>;
		};

		expect(pkg.devDependencies[SKILLS_PACKAGE]).toBe('3.1.1');
		expect(pkg.devDependencies['skills-npm']).toBe('1.2.0');
		expect(pkg.scripts.prepare).toBe('husky && skills-npm --yes');
		expect(readFileSync(join(dir, 'skills-npm.config.ts'), 'utf-8')).toBe(
			SKILLS_NPM_CONFIG_CONTENT
		);
		expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toContain('.cursor/skills/npm-*');
	});

	test('is idempotent once configured', async () => {
		await wireSkillsToProject({
			projectDir: dir,
			skillsVersion: '3.1.1',
		});

		const result = await wireSkillsToProject({
			projectDir: dir,
			skillsVersion: '3.1.1',
		});

		expect(result.changed).toBe(false);
		expect(result.alreadyConfigured).toBe(true);
	});

	test('registers skills command and create --no-skills option', async () => {
		const commands = await discoverCommands();
		const skills = commands.find((command) => command.name === 'skills');
		const project = commands.find((command) => command.name === 'project');
		const create = project?.subcommands?.find((command) => command.name === 'create');
		const optionsSchema = create?.schema?.options as
			| { shape?: Record<string, unknown> }
			| undefined;

		expect(skills).toBeDefined();
		expect(skills?.subcommands?.map((command) => command.name)).toEqual([
			'setup',
			'sync',
			'list',
		]);
		expect(optionsSchema?.shape).toHaveProperty('skills');
	});

	test('throws when package.json is missing', async () => {
		const missing = join(dir, 'missing');
		expect(existsSync(join(missing, 'package.json'))).toBe(false);
		await expect(wireSkillsToProject({ projectDir: missing })).rejects.toThrow('No package.json');
	});
});
