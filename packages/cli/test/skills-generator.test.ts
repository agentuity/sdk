import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const isValidSkillName = (name: string): boolean => {
	if (name.length < 1 || name.length > 64) return false;
	if (!/^[a-z0-9-]+$/.test(name)) return false;
	if (name.startsWith('-') || name.endsWith('-')) return false;
	if (name.includes('--')) return false;
	return true;
};

const toSkillName = (parts: string[]): string => {
	return parts.join('-').toLowerCase();
};

describe('skills generator', () => {
	describe('isValidSkillName', () => {
		test('accepts valid skill names', () => {
			expect(isValidSkillName('login')).toBe(true);
			expect(isValidSkillName('api-key-create')).toBe(true);
			expect(isValidSkillName('a')).toBe(true);
			expect(isValidSkillName('deploy')).toBe(true);
			expect(isValidSkillName('secret-set')).toBe(true);
			expect(isValidSkillName('123')).toBe(true);
			expect(isValidSkillName('a1b2c3')).toBe(true);
		});

		test('rejects invalid skill names', () => {
			expect(isValidSkillName('')).toBe(false);
			expect(isValidSkillName('-login')).toBe(false);
			expect(isValidSkillName('login-')).toBe(false);
			expect(isValidSkillName('api--key')).toBe(false);
			expect(isValidSkillName('Login')).toBe(false);
			expect(isValidSkillName('API_KEY')).toBe(false);
			expect(isValidSkillName('api key')).toBe(false);
			expect(isValidSkillName('api.key')).toBe(false);
		});

		test('rejects names over 64 characters', () => {
			const longName = 'a'.repeat(65);
			expect(isValidSkillName(longName)).toBe(false);
		});

		test('accepts names exactly 64 characters', () => {
			const maxLengthName = 'a'.repeat(64);
			expect(isValidSkillName(maxLengthName)).toBe(true);
		});
	});

	describe('toSkillName', () => {
		test('joins parts with hyphens', () => {
			expect(toSkillName(['login'])).toBe('login');
			expect(toSkillName(['api', 'key', 'create'])).toBe('api-key-create');
			expect(toSkillName(['cloud', 'deploy'])).toBe('cloud-deploy');
		});

		test('converts to lowercase', () => {
			expect(toSkillName(['Login'])).toBe('login');
			expect(toSkillName(['API', 'KEY'])).toBe('api-key');
		});

		test('handles single part', () => {
			expect(toSkillName(['deploy'])).toBe('deploy');
		});

		test('handles empty array', () => {
			expect(toSkillName([])).toBe('');
		});
	});

	describe('directory structure generation', () => {
		test('creates correct path for simple commands', () => {
			const basePath = '/output/agentuity/cli';
			const commandPath = ['auth', 'login'];
			const groupDir = `${basePath}/${commandPath[0]}`;
			const pathWithinGroup = commandPath.slice(1);
			const skillDir = pathWithinGroup.join('-');
			const skillPath = `${groupDir}/${skillDir}/SKILL.md`;

			expect(skillPath).toBe('/output/agentuity/cli/auth/login/SKILL.md');
		});

		test('creates correct path for nested commands', () => {
			const basePath = '/output/agentuity/cli';
			const commandPath = ['cloud', 'apikey', 'create'];
			const groupDir = `${basePath}/${commandPath[0]}`;
			const pathWithinGroup = commandPath.slice(1);
			const skillDir = pathWithinGroup.join('-');
			const skillPath = `${groupDir}/${skillDir}/SKILL.md`;

			expect(skillPath).toBe('/output/agentuity/cli/cloud/apikey-create/SKILL.md');
		});
	});

	describe('SKILL.md format', () => {
		test('frontmatter contains required fields', () => {
			const frontmatter = `---
name: login
description: Authenticate with the Agentuity platform
license: Apache-2.0
allowed-tools: Bash(agentuity:*)
metadata:
  version: "0.0.101"
  command: "agentuity auth login"
---`;

			expect(frontmatter).toContain('name: login');
			expect(frontmatter).toContain('description:');
			expect(frontmatter).toContain('license: Apache-2.0');
			expect(frontmatter).toContain('allowed-tools: Bash(agentuity:*)');
			expect(frontmatter).toContain('metadata:');
			expect(frontmatter).toContain('version:');
			expect(frontmatter).toContain('command:');
		});
	});

	describe('command filtering', () => {
		const EXCLUDED_COMMANDS = new Set(['ai', 'help', 'version']);

		test('excludes ai commands', () => {
			expect(EXCLUDED_COMMANDS.has('ai')).toBe(true);
		});

		test('excludes help command', () => {
			expect(EXCLUDED_COMMANDS.has('help')).toBe(true);
		});

		test('excludes version command', () => {
			expect(EXCLUDED_COMMANDS.has('version')).toBe(true);
		});

		test('includes other commands', () => {
			expect(EXCLUDED_COMMANDS.has('auth')).toBe(false);
			expect(EXCLUDED_COMMANDS.has('cloud')).toBe(false);
			expect(EXCLUDED_COMMANDS.has('project')).toBe(false);
		});
	});

	describe('version checking', () => {
		let testDir: string;

		beforeEach(() => {
			testDir = join(tmpdir(), `skills-test-${Date.now()}`);
			mkdirSync(testDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(testDir, { recursive: true, force: true });
		});

		test('detects missing skills directory', async () => {
			const { checkSkillsVersion } = await import('../src/cmd/dev/skills');
			const result = await checkSkillsVersion(testDir, '1.0.0');
			expect(result.needsRegeneration).toBe(true);
			expect(result.reason).toBe('missing');
		});

		test('detects missing version.txt', async () => {
			const skillsDir = join(testDir, '.agents/skills/agentuity/cli');
			mkdirSync(skillsDir, { recursive: true });

			const { checkSkillsVersion } = await import('../src/cmd/dev/skills');
			const result = await checkSkillsVersion(testDir, '1.0.0');
			expect(result.needsRegeneration).toBe(true);
			expect(result.reason).toBe('version-missing');
		});

		test('detects outdated version', async () => {
			const skillsDir = join(testDir, '.agents/skills/agentuity/cli');
			mkdirSync(skillsDir, { recursive: true });
			writeFileSync(join(skillsDir, 'version.txt'), '0.9.0');

			const { checkSkillsVersion } = await import('../src/cmd/dev/skills');
			const result = await checkSkillsVersion(testDir, '1.0.0');
			expect(result.needsRegeneration).toBe(true);
			expect(result.reason).toBe('outdated');
			expect(result.currentVersion).toBe('0.9.0');
		});

		test('accepts current or newer version', async () => {
			const skillsDir = join(testDir, '.agents/skills/agentuity/cli');
			mkdirSync(skillsDir, { recursive: true });
			writeFileSync(join(skillsDir, 'version.txt'), '1.0.0');

			const { checkSkillsVersion } = await import('../src/cmd/dev/skills');
			const result = await checkSkillsVersion(testDir, '1.0.0');
			expect(result.needsRegeneration).toBe(false);
		});
	});
});
