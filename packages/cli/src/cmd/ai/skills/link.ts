import { z } from 'zod';
import { existsSync, mkdirSync, unlinkSync, copyFileSync, symlinkSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createSubcommand } from '../../../types';
import type { Logger } from '@agentuity/core';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';

const AGENTUITY_PACKAGES = ['runtime', 'react', 'cli', 'core', 'schema', 'server'];

/**
 * Link skills from installed @agentuity packages to .claude/skills/
 * This is a pure helper function (no UI) for reuse in template-flow.ts
 */
export async function linkSkills(
	projectDir: string,
	logger: Logger,
	opts?: { force?: boolean; copy?: boolean }
): Promise<{ linked: number; skipped: number }> {
	const skillsDir = join(projectDir, '.claude', 'skills');
	const nodeModulesDir = join(projectDir, 'node_modules', '@agentuity');

	// Handle case where dependencies aren't installed
	if (!existsSync(nodeModulesDir)) {
		logger.debug(`No @agentuity packages found at ${nodeModulesDir}, skipping skills linking`);
		return { linked: 0, skipped: 0 };
	}

	// Ensure .claude/skills/ exists
	if (!existsSync(skillsDir)) {
		mkdirSync(skillsDir, { recursive: true });
	}

	let linked = 0;
	let skipped = 0;

	for (const pkg of AGENTUITY_PACKAGES) {
		const skillSource = join(nodeModulesDir, pkg, 'skills', 'SKILL.md');
		const skillTarget = join(skillsDir, `agentuity-${pkg}.md`);

		if (!existsSync(skillSource)) {
			logger.debug(`No skill file found for @agentuity/${pkg} at ${skillSource}`);
			continue;
		}

		// Check if target exists
		if (existsSync(skillTarget)) {
			if (!opts?.force) {
				logger.debug(`Skipping ${skillTarget} (exists, use --force to overwrite)`);
				skipped++;
				continue;
			}
			unlinkSync(skillTarget);
		}

		// Create symlink or copy
		const relativePath = relative(skillsDir, skillSource);

		if (opts?.copy) {
			copyFileSync(skillSource, skillTarget);
			logger.debug(`Copied ${skillTarget}`);
		} else {
			try {
				// Explicitly mark as file symlink for Windows compatibility
				symlinkSync(relativePath, skillTarget, 'file');
				logger.debug(`Linked ${skillTarget} -> ${relativePath}`);
			} catch {
				// Fallback to copy on Windows or permission issues
				copyFileSync(skillSource, skillTarget);
				logger.debug(`Copied ${skillTarget} (symlink failed, copied instead)`);
			}
		}
		linked++;
	}

	return { linked, skipped };
}

export const linkSubcommand = createSubcommand({
	name: 'link',
	description: 'Link Agentuity package skills into .claude/skills',
	tags: ['fast', 'mutating'],
	idempotent: true,
	examples: [
		{
			command: getCommand('ai skills link'),
			description: 'Link skills from installed @agentuity packages',
		},
		{
			command: getCommand('ai skills link --force'),
			description: 'Overwrite existing skill files',
		},
		{
			command: getCommand('ai skills link --copy'),
			description: 'Copy files instead of creating symlinks',
		},
	],
	schema: {
		options: z.object({
			dir: z.string().optional().describe('Project directory (default: current directory)'),
			force: z.boolean().optional().describe('Overwrite existing files/symlinks'),
			copy: z.boolean().optional().describe('Copy files instead of creating symlinks'),
		}),
	},
	async handler(ctx) {
		const { logger, opts } = ctx;
		const projectDir = opts.dir ? resolve(opts.dir) : process.cwd();

		const { linked, skipped } = await tui.spinner({
			message: 'Linking skills',
			clearOnSuccess: true,
			callback: async () => linkSkills(projectDir, logger, { force: opts.force, copy: opts.copy }),
		});

		if (linked === 0 && skipped === 0) {
			tui.info('No Agentuity skills found. Are @agentuity packages installed?');
		} else {
			tui.success(`Linked ${linked} skills${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
		}

		return { linked, skipped };
	},
});

export default linkSubcommand;
