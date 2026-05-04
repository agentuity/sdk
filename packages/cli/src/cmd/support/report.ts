import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { APIResponseSchema } from '@agentuity/server';
import archiver from 'archiver';
import { z } from 'zod';
import { getLogSessionsInCurrentWindow } from '../../internal-logger.ts';
import { pathExists } from '../../node-compat/fs.ts';
import { spawnInherit } from '../../node-compat/proc.ts';
import * as tui from '../../tui.ts';
import { createSubcommand } from '../../types.ts';
import { StructuredError } from '@agentuity/core';

// Structured errors for this module
const NoSessionDirectoriesError = StructuredError(
	'NoSessionDirectoriesError',
	'No session directories provided'
);

const ReportUploadError = StructuredError('ReportUploadError')<{
	statusText: string;
	status?: number;
}>();

const UploadUrlCreationError = StructuredError('UploadUrlCreationError');

const BrowserOpenError = StructuredError(
	'BrowserOpenError',
	'Failed to open browser. Please open the URL manually.'
)<{
	exitCode?: number | null;
}>();

const argsSchema = z.object({});

const optionsSchema = z.object({
	description: z
		.string()
		.optional()
		.describe('Description of the issue (skips prompt if provided)'),
	noOpen: z
		.boolean()
		.optional()
		.default(false)
		.describe('Do not automatically open GitHub issue in browser'),
});

const ReportUploadDataSchema = z.object({
	presigned_url: z.string(),
	url: z.string(),
	report_id: z.string(),
	expires_in: z.number(),
});

const ReportUploadResponseSchema = APIResponseSchema(ReportUploadDataSchema);

/**
 * Create a zip file containing session and logs from multiple session directories
 */
async function createReportZip(sessionDirs: string[]): Promise<string> {
	if (sessionDirs.length === 0) {
		throw NoSessionDirectoriesError();
	}

	// Create zip in temp directory, streaming to disk instead of buffering in memory
	const tempZip = join(tmpdir(), `agentuity-report-${randomBytes(8).toString('hex')}.zip`);

	const output = createWriteStream(tempZip);
	const zip = archiver('zip', { zlib: { level: 9 } });

	const writeDone = new Promise<void>((resolve, reject) => {
		output.on('close', resolve);
		output.on('error', reject);
		zip.on('error', reject);
	});

	zip.pipe(output);

	for (const sessionDir of sessionDirs) {
		const sessionFile = join(sessionDir, 'session.json');
		const logsFile = join(sessionDir, 'logs.jsonl');

		// Extract session ID from directory name cross-platform
		const sessionId = basename(sessionDir) || 'unknown';

		// Add files with session ID prefix to avoid conflicts
		if (await pathExists(sessionFile)) {
			zip.file(sessionFile, { name: `${sessionId}/session.json` });
		}
		if (await pathExists(logsFile)) {
			zip.file(logsFile, { name: `${sessionId}/logs.jsonl` });
		}
	}

	await zip.finalize();
	await writeDone;

	return tempZip;
}

/**
 * Upload the zip file to S3 using presigned URL
 */
async function uploadReport(
	presignedUrl: string,
	zipPath: string,
	logger: import('../../types.ts').Logger
): Promise<void> {
	// Stream the zip to S3 without loading it into memory. Node's
	// fetch needs an explicit `Content-Length` plus duplex: 'half' for
	// streamed bodies; we pre-stat the file to provide both.
	const stat = statSync(zipPath);
	const body = Readable.toWeb(
		createReadStream(zipPath)
	) as unknown as NodeWebReadableStream<Uint8Array> as ReadableStream<Uint8Array>;

	const response = await fetch(presignedUrl, {
		method: 'PUT',
		body,
		headers: {
			'Content-Type': 'application/zip',
			'Content-Length': String(stat.size),
		},
		duplex: 'half',
	} as RequestInit & { duplex: 'half' });

	if (!response.ok) {
		const errorText = await response.text();
		logger.error('Upload failed', { status: response.status, error: errorText });
		throw new ReportUploadError({
			message: `Upload failed: ${response.statusText}`,
			statusText: response.statusText,
			status: response.status,
		});
	}
}

/**
 * Create GitHub issue URL with pre-filled template
 */
interface SessionData {
	cli?: { version?: string };
	system?: { bunVersion?: string; platform?: string; arch?: string };
	command?: string;
}

function createGitHubIssueUrl(
	description: string,
	reportUrl: string,
	reportId: string,
	sessionData: SessionData
): string {
	const title = 'CLI Issue Report';

	const body = `## Description

${description}

## Environment

- **CLI Version**: ${sessionData.cli?.version || 'unknown'}
- **Bun Version**: ${sessionData.system?.bunVersion || 'unknown'}
- **Platform**: ${sessionData.system?.platform || 'unknown'} (${sessionData.system?.arch || 'unknown'})

## Report

- **Report ID**: \`${reportId}\`
- **Report Logs**: ${reportUrl}
- **Command**: \`${sessionData.command || 'unknown'}\`

## Additional Context

<!-- Add any additional context or screenshots here -->

---

**Automated report generated by \`agentuity support report\`**
`;

	const params = new URLSearchParams({
		title,
		body,
		labels: 'cli,bug',
	});

	return `https://github.com/agentuity/sdk/issues/new?${params.toString()}`;
}

/**
 * Open URL in default browser
 */
async function openBrowser(url: string, logger: import('../../types.ts').Logger): Promise<void> {
	try {
		// Use platform-specific command to open URL
		const platform = process.platform;
		let command: string;
		let args: string[];

		if (platform === 'darwin') {
			command = 'open';
			args = [url];
		} else if (platform === 'win32') {
			command = 'cmd';
			args = ['/c', 'start', url];
		} else {
			// Linux/Unix
			command = 'xdg-open';
			args = [url];
		}

		const { exitCode } = await spawnInherit({ cmd: [command, ...args] });

		if (exitCode !== 0) {
			throw new BrowserOpenError({ exitCode: exitCode });
		}
	} catch (error) {
		logger.error('Failed to open browser', { error });
		throw new BrowserOpenError({ exitCode: null, cause: error });
	}
}

export default createSubcommand({
	name: 'report',
	description: 'Create a support ticket with CLI logs',
	requires: {
		auth: true,
		apiClient: true,
	},
	schema: {
		args: argsSchema,
		options: optionsSchema,
	},
	handler: async (ctx) => {
		const { opts, logger, apiClient } = ctx;
		const isJsonMode = ctx.options.json;

		// Get all log sessions in the current time window (current + previous bucket)
		const sessionDirs = getLogSessionsInCurrentWindow();
		if (sessionDirs.length === 0) {
			if (isJsonMode) {
				console.log(JSON.stringify({ success: false, error: 'No CLI logs found' }));
			} else {
				tui.error('No CLI logs found');
				tui.info('Run a command first to generate logs, then create a support ticket.');
			}
			return;
		}

		// Use the first (most recent) session for metadata
		const primarySessionDir = sessionDirs[0]!;
		const sessionFile = join(primarySessionDir, 'session.json');

		// Safely read session data with fallback for corrupt/missing session.json
		let sessionData: SessionData = {};
		let cliVersion = 'unknown';
		try {
			if (await pathExists(sessionFile)) {
				sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));
				cliVersion = sessionData.cli?.version || 'unknown';
			}
		} catch {
			// Fall back to defaults if session.json is corrupt or unreadable
			logger.trace('Failed to read session.json, using defaults');
		}

		// Log how many sessions we're including
		if (!isJsonMode && sessionDirs.length > 1) {
			tui.info(`Found ${sessionDirs.length} session(s) in the current time window`);
		}

		// Get issue description from:
		// 1. --description flag
		// 2. stdin (if piped/not a TTY)
		// 3. Interactive prompt (if TTY)
		let description = opts.description;

		if (!description && !process.stdin.isTTY) {
			// Read description from stdin (piped input)
			try {
				const chunks: Buffer[] = [];
				for await (const chunk of process.stdin) {
					chunks.push(chunk);
				}
				description = Buffer.concat(chunks).toString('utf-8').trim();
			} catch (error) {
				logger.trace('Failed to read stdin', { error });
			}
		}

		if (!description && !isJsonMode && process.stdin.isTTY) {
			// Prompt user for description
			tui.info(tui.bold('Create a CLI Bug Report'));
			tui.newline();
			tui.output(
				'Please describe the issue you encountered. This will be included in the GitHub issue.'
			);
			tui.output(tui.muted('(Press Enter twice when done, or Ctrl+C to cancel)'));
			tui.newline();

			const { createPrompt } = tui;
			const prompt = createPrompt();

			try {
				description = await prompt.text({
					message: 'Issue description:',
					hint: 'Describe what happened and what you expected...',
				});

				// Cleanup stdin after prompt
				if (process.stdin.isTTY) {
					process.stdin.pause();
				}
			} catch (error) {
				// User cancelled
				logger.trace('User cancelled report', { error });
				if (!isJsonMode) {
					tui.warning('Report cancelled');
				}
				return;
			}
		}

		if (!description || description.trim() === '') {
			if (isJsonMode) {
				console.log(JSON.stringify({ success: false, error: 'Description is required' }));
			} else {
				tui.error('Description is required. Use --description flag or pipe input via stdin.');
			}
			return;
		}

		try {
			// Step 1: Create presigned upload URL
			if (!isJsonMode) {
				tui.info('Creating upload URL...');
			}

			const uploadResponse = await apiClient.request(
				'POST',
				'/cli/support/upload',
				ReportUploadResponseSchema,
				{
					cliVersion,
					platform: sessionData.system?.platform || 'unknown',
				}
			);

			// Debug: log the response
			logger.debug('Upload response received', { uploadResponse });

			if (!uploadResponse.success) {
				const errorMsg = uploadResponse.message || 'Failed to create upload URL';
				logger.error('Upload URL creation failed', { uploadResponse, errorMsg });
				throw new UploadUrlCreationError({ message: errorMsg });
			}

			const { presigned_url, url: reportUrl, report_id: reportId } = uploadResponse.data;

			// Step 2: Create zip file
			if (!isJsonMode) {
				tui.info('Creating report archive...');
			}

			const zipPath = await createReportZip(sessionDirs);

			// Step 3: Upload to S3
			if (!isJsonMode) {
				tui.info('Uploading report...');
			}

			await uploadReport(presigned_url, zipPath, logger);

			// Step 4: Create GitHub issue URL
			const githubUrl = createGitHubIssueUrl(description, reportUrl, reportId, sessionData);

			if (isJsonMode) {
				console.log(
					JSON.stringify({
						success: true,
						data: {
							report_url: reportUrl,
							github_url: githubUrl,
						},
					})
				);
			} else {
				tui.newline();
				tui.success('Report created successfully!');
				tui.newline();
				tui.output(`Report URL: ${tui.colorPrimary(reportUrl)}`);
				tui.output(`GitHub Issue: ${tui.colorInfo(githubUrl)}`);
				tui.newline();

				if (!opts.noOpen) {
					tui.info('Opening GitHub issue in browser...');
					try {
						await openBrowser(githubUrl, logger);
						tui.newline();
						tui.output(
							tui.muted(
								'Please review the pre-filled issue and click "Submit new issue" when ready.'
							)
						);
					} catch {
						tui.warning('Could not open browser automatically');
						tui.output('Please open this URL in your browser:');
						tui.output(tui.link(githubUrl));
					}
				} else {
					tui.output('To create the GitHub issue, open:');
					tui.output(tui.link(githubUrl));
				}
			}
		} catch (error) {
			if (isJsonMode) {
				console.log(
					JSON.stringify({
						success: false,
						error: error instanceof Error ? error.message : 'Failed to create report',
					})
				);
			} else {
				tui.error('Failed to create report');
				tui.output(error instanceof Error ? error.message : 'Unknown error');
			}
			logger.fatal('Failed to create report', { error });
		}
	},
});
