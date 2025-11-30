import { createSubcommand } from '../../../types';
import { addSSHKey, computeSSHKeyFingerprint, listSSHKeys } from './api';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import enquirer from 'enquirer';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { ErrorCode } from '../../../errors';

const optionsSchema = z.object({
	file: z.string().optional().describe('File containing the public key'),
});

const SSHAddResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	fingerprint: z.string().describe('SSH key fingerprint'),
	keyType: z.string().describe('SSH key type (e.g., ssh-rsa, ssh-ed25519)'),
	added: z.number().describe('Number of keys added'),
});

interface SSHKeyOption {
	path: string;
	filename: string;
	publicKey: string;
	fingerprint: string;
	comment: string;
}

/**
 * Scan ~/.ssh directory for valid SSH public keys
 */
function discoverSSHKeys(): SSHKeyOption[] {
	const sshDir = join(homedir(), '.ssh');
	const keys: SSHKeyOption[] = [];
	const seenFingerprints = new Set<string>();

	try {
		const files = readdirSync(sshDir);

		for (const file of files) {
			// Only look at .pub files (public keys)
			if (!file.endsWith('.pub')) {
				continue;
			}

			const filePath = join(sshDir, file);

			try {
				const stat = statSync(filePath);
				if (!stat.isFile()) {
					continue;
				}

				const content = readFileSync(filePath, 'utf-8').trim();

				// Validate it's a valid SSH key
				const fingerprint = computeSSHKeyFingerprint(content);

				// Skip duplicate fingerprints
				if (seenFingerprints.has(fingerprint)) {
					continue;
				}
				seenFingerprints.add(fingerprint);

				// Extract comment if present (last part of the key)
				const parts = content.split(/\s+/);
				const comment = parts.length >= 3 ? parts.slice(2).join(' ') : '';

				keys.push({
					path: filePath,
					filename: file,
					publicKey: content,
					fingerprint,
					comment,
				});
			} catch {
				// Skip invalid keys
				continue;
			}
		}
	} catch {
		// If we can't read ~/.ssh, just return empty array
		return [];
	}

	// Sort by filename for predictable ordering
	return keys.sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * Read stdin once if non-TTY and return its contents, or null when there is
 * no piped data (e.g. timeout).
 * This helper should be the only place that consumes Bun.stdin.
 */
async function readStdinIfPiped(): Promise<string | null> {
	if (process.stdin.isTTY) {
		return null;
	}

	try {
		const stdin = await Promise.race([
			Bun.stdin.text(),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
		]);

		return stdin !== null && stdin.trim().length > 0 ? stdin : null;
	} catch {
		return null;
	}
}

export const addCommand = createSubcommand({
	name: 'add',
	aliases: ['create'],
	description: 'Add an SSH public key to your account (reads from file or stdin)',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth'],
	idempotent: false,
	requires: { apiClient: true, auth: true },
	examples: [
		{ command: getCommand('auth ssh add'), description: 'Add SSH key interactively' },
		{
			command: getCommand('auth ssh add --file ~/.ssh/id_ed25519.pub'),
			description: 'Add SSH key from file',
		},
		{
			command: getCommand('auth ssh add --file ./deploy_key.pub'),
			description: 'Add deploy key from file',
		},
		{
			command: 'cat ~/.ssh/id_rsa.pub | ' + getCommand('auth ssh add'),
			description: 'Add SSH key from stdin',
		},
	],
	schema: {
		options: optionsSchema,
		response: SSHAddResponseSchema,
	},
	async handler(ctx) {
		const { logger, apiClient, opts } = ctx;

		if (!apiClient) {
			return logger.fatal('API client is not available', ErrorCode.INTERNAL_ERROR) as never;
		}

		try {
			let publicKey: string = '';

			if (opts.file) {
				// Read from file
				try {
					publicKey = readFileSync(opts.file, 'utf-8').trim();
				} catch (error) {
					return logger.fatal(
						`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`
					) as never;
				}
			} else {
				const stdin = await readStdinIfPiped();
				if (stdin) {
					// Read from stdin if data is piped
					publicKey = stdin.trim();
				} else {
					// No file or stdin - discover SSH keys
					const discoveredKeys = discoverSSHKeys();

					if (discoveredKeys.length === 0) {
						return logger.fatal(
							'No SSH public keys found in ~/.ssh/\n' +
								'Please specify a file with --file or pipe the key via stdin'
						) as never;
					}

					// Fetch existing keys from server to filter out already-added ones
					const existingKeys = await tui.spinner({
						type: 'simple',
						message: 'Checking existing SSH keys...',
						callback: () => listSSHKeys(apiClient),
						clearOnSuccess: true,
					});

					const existingFingerprints = new Set(existingKeys.map((k) => k.fingerprint));
					const newKeys = discoveredKeys.filter(
						(k) => !existingFingerprints.has(k.fingerprint)
					);

					if (newKeys.length === 0) {
						const cmd = getCommand('auth ssh add');
						const boldcmd = tui.bold('cat key.pub | ' + cmd);
						tui.info('All local SSH keys in ~/.ssh/ have already been added to your account');
						tui.newline();
						console.log('To add a different key:');
						tui.bullet(`Use ${tui.bold('--file <path>')} to specify a key file`);
						tui.bullet(`Pipe the key via stdin: ${boldcmd}`);
						return { success: false, fingerprint: '', keyType: '', added: 0 };
					}

					if (!process.stdin.isTTY) {
						return logger.fatal(
							'Interactive selection required but cannot prompt in non-TTY environment. Use --file or pipe the key via stdin.'
						) as never;
					}

					const response = await enquirer.prompt<{ keys: string[] }>({
						type: 'multiselect',
						name: 'keys',
						message: 'Select SSH keys to add (Space to select, Enter to confirm)',
						choices: newKeys.map((key) => {
							const keyType = key.publicKey.split(/\s+/)[0] || 'unknown';
							return {
								name: key.fingerprint,
								message: `${keyType.padEnd(12)} ${key.fingerprint} ${tui.muted(key.comment || key.filename)}`,
							};
						}),
					});

					const selectedFingerprints = response.keys;

					if (selectedFingerprints.length === 0) {
						tui.newline();
						tui.info('No keys selected');
						return { success: false, fingerprint: '', keyType: '', added: 0 };
					}

					// Build Map for O(1) lookups
					const keyMap = new Map(newKeys.map((k) => [k.fingerprint, k]));

					// Add all selected keys
					let addedCount = 0;
					let lastFingerprint = '';
					let lastKeyType = '';

					for (const fingerprint of selectedFingerprints) {
						const key = keyMap.get(fingerprint);
						if (!key) continue;

						try {
							const result = await tui.spinner({
								type: 'simple',
								message: `Adding SSH key ${fingerprint}...`,
								callback: () => addSSHKey(apiClient, key.publicKey),
								clearOnSuccess: true,
							});
							tui.success(`SSH key added: ${tui.muted(result.fingerprint)}`);
							addedCount++;
							lastFingerprint = result.fingerprint;
							lastKeyType = key.publicKey.split(/\s+/)[0] || 'unknown';
						} catch (error) {
							tui.newline();
							if (error instanceof Error) {
								tui.error(`Failed to add ${fingerprint}: ${error.message}`);
							} else {
								tui.error(`Failed to add ${fingerprint}`);
							}
						}
					}

					return {
						success: addedCount > 0,
						fingerprint: lastFingerprint,
						keyType: lastKeyType,
						added: addedCount,
					};
				}
			}

			// Only process single key if we got here (from --file or stdin)
			if (!publicKey) {
				return logger.fatal('No public key provided') as never;
			}

			// Validate key format
			try {
				computeSSHKeyFingerprint(publicKey);
			} catch (error) {
				return logger.fatal(
					`Invalid SSH key format: ${error instanceof Error ? error.message : 'Unknown error'}`
				) as never;
			}

			const result = await tui.spinner({
				type: 'simple',
				message: 'Adding SSH key...',
				callback: () => addSSHKey(apiClient, publicKey),
				clearOnSuccess: true,
			});

			tui.success(`SSH key added: ${tui.muted(result.fingerprint)}`);

			return {
				success: true,
				fingerprint: result.fingerprint,
				keyType: publicKey.trim().split(/\s+/)[0] || 'unknown',
				added: 1,
			};
		} catch (error) {
			logger.trace(error);
			if (error instanceof Error) {
				return logger.fatal(
					`Failed to add SSH key: ${error.message}`,
					ErrorCode.API_ERROR
				) as never;
			} else {
				return logger.fatal('Failed to add SSH key', ErrorCode.API_ERROR) as never;
			}
		}
	},
});
