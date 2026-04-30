import { z } from 'zod';
import { readStdinText } from '../../../node-compat/stdin.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';
import { orgAuthEnroll } from '@agentuity/server';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { readFileSync } from 'fs';

const EnrollResponseSchema = z.object({
	success: z.boolean().describe('Whether the enrollment succeeded'),
	orgId: z.string().describe('The organization ID'),
});

export const enrollSubcommand = createSubcommand({
	name: 'enroll',
	description:
		'Configure your organization for self-hosted infrastructure by uploading a public key',
	tags: ['mutating', 'slow', 'requires-auth', 'uses-stdin'],
	examples: [
		{
			command: `${getCommand('auth org enroll')} --file ./public-key.pem`,
			description: 'Upload ECDSA P-256 public key from file',
		},
		{
			command: `cat public-key.pem | ${getCommand('auth org enroll')}`,
			description: 'Upload public key from stdin',
		},
	],
	requires: { auth: true, apiClient: true, org: true },
	idempotent: true,
	schema: {
		options: z.object({
			file: z.string().optional().describe('Path to the public key file (PEM format)'),
		}),
		response: EnrollResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, opts, options, logger, orgId } = ctx;

		try {
			let publicKey: string = '';

			if (opts.file) {
				try {
					publicKey = readFileSync(opts.file, 'utf-8').trim();
				} catch (error) {
					return logger.fatal(
						`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`,
						ErrorCode.FILE_NOT_FOUND
					) as never;
				}
			} else if (!process.stdin.isTTY) {
				try {
					const stdin = await Promise.race([
						readStdinText(),
						new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
					]);

					if (stdin && stdin.trim().length > 0) {
						publicKey = stdin.trim();
					}
				} catch {
					// Ignore stdin read errors
				}
			}

			if (!publicKey) {
				return logger.fatal(
					'No public key provided. Use --file to specify a file or pipe the key via stdin.\n\n' +
						'Generate a key with:\n' +
						'  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve -out private.pem\n' +
						'  openssl pkey -in private.pem -pubout -out public.pem',
					ErrorCode.INVALID_ARGUMENT
				) as never;
			}

			if (!publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
				return logger.fatal(
					'Invalid public key format. Expected PEM format starting with "-----BEGIN PUBLIC KEY-----"',
					ErrorCode.INVALID_ARGUMENT
				) as never;
			}

			const result = await tui.spinner({
				type: 'simple',
				message: 'Enrolling organization...',
				callback: () => orgAuthEnroll(apiClient, orgId, publicKey),
				clearOnSuccess: true,
			});

			if (!options.json) {
				tui.success(`Organization ${result.orgId} enrolled for self-hosted infrastructure.`);
				tui.newline();
				tui.info(
					'Your self-hosted machines can now authenticate using the corresponding private key.'
				);
			}

			return { success: true, orgId: result.orgId };
		} catch (ex) {
			tui.fatal(`Failed to enroll organization: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
