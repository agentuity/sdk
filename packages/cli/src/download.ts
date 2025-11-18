import { Transform, Readable } from 'node:stream';
import * as tui from './tui';

export interface DownloadOptions {
	url: string;
	headers?: Record<string, string>;
	message?: string;
	onProgress?: (percent: number, downloadedBytes: number, totalBytes: number) => void;
}

/**
 * Download a file with progress tracking
 * Returns the response body stream for further processing
 */
export async function downloadWithProgress(
	options: DownloadOptions
): Promise<NodeJS.ReadableStream> {
	const { url, headers = {}, onProgress } = options;

	// Add GITHUB_TOKEN if available and not already set
	const requestHeaders = { ...headers };
	if (process.env.GITHUB_TOKEN && !requestHeaders['Authorization']) {
		requestHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
	}

	const response = await fetch(url, { headers: requestHeaders });
	if (!response.ok) {
		throw new Error(`Download failed: ${response.statusText}`);
	}

	const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
	let downloadedBytes = 0;

	// Create a transform stream that tracks progress
	const progressStream = new Transform({
		transform(chunk, _encoding, callback) {
			downloadedBytes += chunk.length;

			if (contentLength > 0) {
				const percent = Math.min(100, Math.floor((downloadedBytes / contentLength) * 100));
				if (onProgress) {
					onProgress(percent, downloadedBytes, contentLength);
				}
			}

			callback(null, chunk);
		},
	});

	// Pipe the response through the progress tracker
	const responseStream = Readable.fromWeb(response.body as unknown as ReadableStream);
	responseStream.pipe(progressStream);

	return progressStream;
}

/**
 * Download a file with a TUI spinner showing progress
 */
export async function downloadWithSpinner<T>(
	options: DownloadOptions,
	processor: (stream: NodeJS.ReadableStream) => Promise<T>
): Promise<T> {
	const { message = 'Downloading...' } = options;

	return await tui.spinner({
		type: 'progress',
		message,
		clearOnSuccess: true,
		callback: async (updateProgress) => {
			const stream = await downloadWithProgress({
				...options,
				onProgress: (percent) => updateProgress(percent),
			});

			const result = await processor(stream);

			// Ensure we show 100% at the end
			updateProgress(100);

			return result;
		},
	});
}

/**
 * Download a GitHub tarball with progress tracking
 */
export interface DownloadGitHubOptions {
	repo: string;
	branch?: string;
	message?: string;
}

export async function downloadGitHubTarball(
	options: DownloadGitHubOptions
): Promise<NodeJS.ReadableStream> {
	const { repo, branch = 'main', message = 'Downloading from GitHub...' } = options;
	const url = `https://codeload.github.com/${repo}/tar.gz/${branch}`;

	return await downloadWithSpinner({ url, message }, async (stream) => stream);
}
