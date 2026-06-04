import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { CoderClient } from '@agentuity/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';

async function readSkillContent(input: {
	content?: string;
	contentFile?: string;
}): Promise<string> {
	if (input.content !== undefined && input.contentFile) {
		throw new Error('Use either --content or --content-file, not both.');
	}
	if (input.content !== undefined) return input.content;
	if (!input.contentFile) {
		throw new Error('Provide --content or --content-file.');
	}
	try {
		return await readFile(input.contentFile, 'utf-8');
	} catch (error) {
		throw new Error(
			`Failed to read content file "${input.contentFile}": ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
}

export const createCustomSkillSubcommand = createSubcommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a custom SKILL.md-backed skill',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand(
				'coder skill create --skill-id release-checklist --name "Release checklist" --content-file ./SKILL.md'
			),
			description: 'Create a custom skill from a SKILL.md file',
		},
		{
			command: getCommand(
				'coder skill create --skill-id release-checklist --name "Release checklist" --content "# Release checklist" --json'
			),
			description: 'Create a custom skill from inline content and return JSON',
		},
	],
	schema: {
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
			skillId: z.string().describe('Skill identifier'),
			name: z.string().describe('Skill name'),
			description: z.string().optional().describe('Skill description'),
			content: z.string().optional().describe('Inline SKILL.md content'),
			contentFile: z.string().optional().describe('Path to a SKILL.md file'),
		}),
	},
	async handler(ctx) {
		const { opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		let content: string;
		try {
			content = await readSkillContent({
				content: opts?.content,
				contentFile: opts?.contentFile,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to create custom skill: ${msg}`, ErrorCode.VALIDATION_FAILED);
			return;
		}

		if (!content.trim()) {
			tui.fatal(
				'Failed to create custom skill: SKILL.md content cannot be empty.',
				ErrorCode.VALIDATION_FAILED
			);
			return;
		}

		try {
			const saved = await client.createCustomSkill({
				skillId: opts.skillId,
				name: opts.name,
				...(opts?.description !== undefined ? { description: opts.description } : {}),
				content,
			});

			if (options.json) {
				return saved;
			}

			tui.success(`Custom skill ${saved.id} created.`);
			tui.newline();
			tui.output(`  Name:     ${tui.bold(saved.name)}`);
			tui.output(`  Skill ID: ${saved.skillId}`);
			tui.output(`  Source:   ${saved.source}`);
			if (saved.description) {
				tui.output(`  Desc:     ${saved.description}`);
			}

			return saved;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
				tui.fatal(`Failed to create custom skill: ${err.message}`, ErrorCode.VALIDATION_FAILED);
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to create custom skill: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
