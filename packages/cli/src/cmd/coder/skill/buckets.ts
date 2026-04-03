import { z } from 'zod';
import { CoderClient, type CoderSkillBucket } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

function formatRelativeTime(isoDate: string): string {
	const parsed = new Date(isoDate).getTime();
	if (Number.isNaN(parsed)) return 'unknown';
	const diffMs = Math.max(0, Date.now() - parsed);
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const bucketsSubcommand = createSubcommand({
	name: 'buckets',
	aliases: ['bucket'],
	description: 'List, create, or delete skill buckets',
	tags: ['requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder skill buckets'),
			description: 'List skill buckets',
		},
		{
			command: getCommand('coder skill buckets --create "My Bucket"'),
			description: 'Create a new skill bucket',
		},
		{
			command: getCommand(
				'coder skill buckets --create "My Bucket" --description "Frontend skills"'
			),
			description: 'Create a skill bucket with description',
		},
		{
			command: getCommand('coder skill buckets --delete bucket_abc123'),
			description: 'Delete a skill bucket',
		},
		{
			command: getCommand('coder skill buckets --json'),
			description: 'List skill buckets as JSON',
		},
	],
	schema: {
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
			create: z.string().optional().describe('Create a new bucket with this name'),
			delete: z.string().optional().describe('Delete bucket by ID'),
			description: z
				.string()
				.optional()
				.describe('Description for new bucket (used with --create)'),
		}),
	},
	async handler(ctx) {
		const { opts, options } = ctx;

		// Validate mutually exclusive actions
		if (opts?.create && opts?.delete) {
			tui.fatal('Cannot use --create and --delete together.', ErrorCode.VALIDATION_FAILED);
		}
		if (opts?.create && !opts.create.trim()) {
			tui.fatal('--create requires a non-empty bucket name.', ErrorCode.VALIDATION_FAILED);
		}
		if (opts?.delete && !opts.delete.trim()) {
			tui.fatal('--delete requires a non-empty bucket ID.', ErrorCode.VALIDATION_FAILED);
		}
		if (opts?.description && !opts?.create) {
			tui.fatal('--description can only be used with --create.', ErrorCode.VALIDATION_FAILED);
		}

		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		// Delete a bucket
		if (opts?.delete) {
			if (!options.json) {
				const confirmed = await tui.confirm(`Delete skill bucket ${opts.delete}?`, false);
				if (!confirmed) {
					tui.info('Cancelled.');
					return { deleted: false, id: opts.delete };
				}
			}

			try {
				await client.deleteSkillBucket(opts.delete);
			} catch (err) {
				if (err instanceof ValidationOutputError) {
					ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
					ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
				}
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(
					`Failed to delete skill bucket ${opts.delete}: ${msg}`,
					ErrorCode.NETWORK_ERROR
				);
			}

			if (options.json) {
				return { deleted: true, id: opts.delete };
			}

			tui.success(`Skill bucket ${opts.delete} deleted.`);
			return { deleted: true, id: opts.delete };
		}

		// Create a bucket
		if (opts?.create) {
			try {
				const created = await client.createSkillBucket({
					name: opts.create,
					...(opts?.description && { description: opts.description }),
				});

				if (options.json) {
					return created;
				}

				tui.success(`Skill bucket ${created.id} created.`);
				tui.newline();
				tui.output(`  Name:   ${tui.bold(created.name)}`);
				if (created.description) {
					tui.output(`  Desc:   ${created.description}`);
				}
				tui.output(`  Skills: ${created.skillCount}`);

				return created;
			} catch (err) {
				if (err instanceof ValidationOutputError) {
					ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
					ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
				}
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Failed to create skill bucket: ${msg}`, ErrorCode.NETWORK_ERROR);
				return;
			}
		}

		// Default: list buckets
		let buckets: CoderSkillBucket[] = [];
		try {
			const response = await client.listSkillBuckets();
			buckets = response.buckets;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to list Coder skill buckets: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return buckets;
		}

		if (buckets.length === 0) {
			tui.info('No Coder skill buckets found.');
			return [];
		}

		tui.table(
			buckets.map((b) => ({
				ID: b.id,
				Name: b.name,
				Skills: String(b.skillCount),
				Created: formatRelativeTime(b.createdAt),
			})),
			[
				{ name: 'ID', alignment: 'left' },
				{ name: 'Name', alignment: 'left' },
				{ name: 'Skills', alignment: 'right' },
				{ name: 'Created', alignment: 'right' },
			]
		);

		return buckets;
	},
});
