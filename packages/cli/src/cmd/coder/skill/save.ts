import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';

export const saveSkillSubcommand = createSubcommand({
	name: 'save',
	aliases: ['add', 'upsert'],
	description: 'Save a skill to your library',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand(
				'coder skill save --repo my-org/my-repo --skill-id sk_abc123 --name "My Skill"'
			),
			description: 'Save a skill to your library',
		},
		{
			command: getCommand(
				'coder skill save --repo my-org/my-repo --skill-id sk_abc123 --name "My Skill" --description "Useful skill" --skill-url https://example.com --json'
			),
			description: 'Save a skill with all options and return JSON',
		},
	],
	schema: {
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
			repo: z.string().describe('Repository identifier for the skill'),
			skillId: z.string().describe('Skill identifier'),
			name: z.string().describe('Skill name'),
			description: z.string().optional().describe('Skill description'),
			skillUrl: z.string().optional().describe('Skill URL'),
			source: z.string().optional().describe('Skill source (default: registry)'),
			content: z.string().optional().describe('Skill content'),
		}),
	},
	async handler(ctx) {
		const { opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		try {
			const saved = await client.saveSkill({
				repo: opts.repo,
				skillId: opts.skillId,
				name: opts.name,
				...(opts?.description !== undefined && { description: opts.description }),
				...(opts?.skillUrl !== undefined && { url: opts.skillUrl }),
				...(opts?.source !== undefined && { source: opts.source }),
				...(opts?.content !== undefined && { content: opts.content }),
			});

			if (options.json) {
				return saved;
			}

			tui.success(`Skill ${saved.id} saved.`);
			tui.newline();
			tui.output(`  Name:   ${tui.bold(saved.name)}`);
			tui.output(`  Repo:   ${saved.repo}`);
			tui.output(`  Source: ${saved.source}`);
			if (saved.description) {
				tui.output(`  Desc:   ${saved.description}`);
			}

			return saved;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
				tui.fatal(`Failed to save skill: ${err.message}`, ErrorCode.VALIDATION_FAILED);
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to save skill: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
