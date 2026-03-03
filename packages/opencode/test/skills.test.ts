import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { parseFrontmatter } from '../src/skills/frontmatter';
import { loadSkillsFromDir, getSkillByName } from '../src/skills/loader';
import type { SkillMetadata, LoadedSkill, SkillScope } from '../src/skills/types';

describe('Skills', () => {
	describe('parseFrontmatter', () => {
		it('parses valid YAML frontmatter', () => {
			const content = `---
name: test-skill
description: A test skill
model: anthropic/claude-sonnet-4-5
---
This is the body content.`;

			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.data.name).toBe('test-skill');
			expect(result.data.description).toBe('A test skill');
			expect(result.data.model).toBe('anthropic/claude-sonnet-4-5');
			expect(result.body).toBe('This is the body content.');
		});

		it('returns empty data when no frontmatter present', () => {
			const content = 'Just regular content without frontmatter.';
			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.data).toEqual({});
			expect(result.body).toBe('Just regular content without frontmatter.');
		});

		it('handles empty frontmatter', () => {
			const content = `---

---
Body only`;
			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.data).toEqual({});
			expect(result.body).toBe('Body only');
		});

		it('handles frontmatter with complex types', () => {
			const content = `---
name: complex-skill
allowed-tools:
  - read
  - write
  - bash
metadata:
  author: Test Author
  version: "1.0"
---
Complex body`;

			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.data.name).toBe('complex-skill');
			expect(result.data['allowed-tools']).toEqual(['read', 'write', 'bash']);
			expect(result.data.metadata).toEqual({ author: 'Test Author', version: '1.0' });
		});

		it('handles malformed YAML gracefully', () => {
			const content = `---
invalid: yaml: content: [
---
Body content`;

			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.data).toEqual({});
			// Falls back to original content when YAML parsing fails
			expect(result.body).toBe(content.trim());
		});

		it('handles Windows-style line endings', () => {
			const content = '---\r\nname: windows-skill\r\n---\r\nBody content';
			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.data.name).toBe('windows-skill');
			expect(result.body).toBe('Body content');
		});

		it('preserves multiline body content', () => {
			const content = `---
name: multiline
---
Line 1
Line 2
Line 3`;

			const result = parseFrontmatter<SkillMetadata>(content);
			expect(result.body).toBe('Line 1\nLine 2\nLine 3');
		});
	});

	describe('loadSkillsFromDir', () => {
		const testDir = join(process.cwd(), '.test-skills-temp');

		beforeEach(async () => {
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		it('loads .md files from directory', async () => {
			await writeFile(
				join(testDir, 'my-skill.md'),
				`---
name: my-skill
description: Test skill
---
Skill content here`
			);

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe('my-skill');
			expect(skills[0].metadata.description).toBe('Test skill');
			expect(skills[0].content).toBe('Skill content here');
			expect(skills[0].scope).toBe('project');
		});

		it('loads SKILL.md from subdirectories', async () => {
			const subdir = join(testDir, 'subskill');
			await mkdir(subdir);
			await writeFile(
				join(subdir, 'SKILL.md'),
				`---
name: subskill
---
Subskill content`
			);

			const skills = await loadSkillsFromDir(testDir, 'user');
			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe('subskill');
			expect(skills[0].scope).toBe('user');
		});

		it('loads {dirname}.md from subdirectories', async () => {
			const subdir = join(testDir, 'named-skill');
			await mkdir(subdir);
			await writeFile(
				join(subdir, 'named-skill.md'),
				`---
description: Named skill
---
Named skill content`
			);

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe('named-skill'); // Uses directory name
			expect(skills[0].metadata.description).toBe('Named skill');
		});

		it('prefers SKILL.md over {dirname}.md', async () => {
			const subdir = join(testDir, 'both');
			await mkdir(subdir);
			await writeFile(
				join(subdir, 'SKILL.md'),
				`---
name: from-skill-md
---
From SKILL.md`
			);
			await writeFile(
				join(subdir, 'both.md'),
				`---
name: from-dirname-md
---
From dirname.md`
			);

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe('from-skill-md');
		});

		it('returns empty array for non-existent directory', async () => {
			const skills = await loadSkillsFromDir('/nonexistent/path', 'user');
			expect(skills).toEqual([]);
		});

		it('uses filename as default name when not specified', async () => {
			await writeFile(
				join(testDir, 'unnamed.md'),
				`---
description: No name specified
---
Content`
			);

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe('unnamed');
		});

		it('parses allowed-tools from frontmatter', async () => {
			await writeFile(
				join(testDir, 'restricted.md'),
				`---
name: restricted-skill
allowed-tools:
  - read
  - grep
---
Restricted skill`
			);

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].allowedTools).toEqual(['read', 'grep']);
		});

		it('handles allowed-tools as string', async () => {
			await writeFile(
				join(testDir, 'single-tool.md'),
				`---
name: single-tool
allowed-tools: read
---
Single tool skill`
			);

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].allowedTools).toEqual(['read']);
		});

		it('loads multiple skills from same directory', async () => {
			await writeFile(join(testDir, 'skill1.md'), '---\nname: skill1\n---\nContent 1');
			await writeFile(join(testDir, 'skill2.md'), '---\nname: skill2\n---\nContent 2');
			await writeFile(join(testDir, 'skill3.md'), '---\nname: skill3\n---\nContent 3');

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(3);
			const names = skills.map((s) => s.name).sort();
			expect(names).toEqual(['skill1', 'skill2', 'skill3']);
		});

		it('ignores non-markdown files', async () => {
			await writeFile(join(testDir, 'valid.md'), '---\nname: valid\n---\nContent');
			await writeFile(join(testDir, 'ignore.txt'), 'Not a skill');
			await writeFile(join(testDir, 'ignore.json'), '{}');

			const skills = await loadSkillsFromDir(testDir, 'project');
			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe('valid');
		});
	});

	describe('getSkillByName', () => {
		const mockSkills: LoadedSkill[] = [
			{
				name: 'alpha',
				path: '/skills/alpha.md',
				resolvedPath: '/skills',
				content: 'Alpha content',
				metadata: { description: 'Alpha skill' },
				scope: 'user',
			},
			{
				name: 'beta',
				path: '/skills/beta.md',
				resolvedPath: '/skills',
				content: 'Beta content',
				metadata: { description: 'Beta skill' },
				scope: 'project',
			},
		];

		it('finds skill by name', () => {
			const skill = getSkillByName(mockSkills, 'alpha');
			expect(skill).toBeDefined();
			expect(skill?.name).toBe('alpha');
		});

		it('returns undefined for unknown skill', () => {
			const skill = getSkillByName(mockSkills, 'gamma');
			expect(skill).toBeUndefined();
		});

		it('is case-sensitive', () => {
			const skill = getSkillByName(mockSkills, 'Alpha');
			expect(skill).toBeUndefined();
		});
	});

	describe('Types', () => {
		it('SkillScope covers all scopes', () => {
			const scopes: SkillScope[] = ['project', 'user', 'opencode'];
			expect(scopes).toHaveLength(3);
		});

		it('LoadedSkill interface is complete', () => {
			const skill: LoadedSkill = {
				name: 'test-skill',
				path: '/path/to/skill.md',
				resolvedPath: '/resolved/path',
				content: 'Skill body content',
				metadata: {
					name: 'test-skill',
					description: 'A test skill',
					model: 'anthropic/claude-sonnet-4-5',
					agent: 'builder',
					subtask: true,
					'argument-hint': 'provide details',
					'allowed-tools': ['read', 'write'],
					license: 'MIT',
				},
				scope: 'project',
				allowedTools: ['read', 'write'],
			};

			expect(skill.name).toBe('test-skill');
			expect(skill.scope).toBe('project');
			expect(skill.allowedTools).toEqual(['read', 'write']);
		});
	});
});
