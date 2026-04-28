import { writeAndDrain } from '@agentuity/server';
import type { Logger } from '@agentuity/core';
import * as tui from '../tui.ts';

export interface StreamUrlOptions {
	signal?: AbortSignal;
	follow?: boolean;
	timestamps?: boolean;
	grep?: string;
	tail?: number;
	json?: boolean;
	label?: string;
	raw?: boolean;
	v2?: boolean;
}

export interface StreamUrlResult {
	bytesRead: number;
	chunks: number;
}

export class StreamFetchError extends Error {
	constructor(
		public status: number,
		public statusText: string,
		message: string
	) {
		super(message);
		this.name = 'StreamFetchError';
	}
}

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function streamUrlToWritable(
	url: string,
	writable: NodeJS.WritableStream,
	logger: Logger,
	options: StreamUrlOptions = {}
): Promise<StreamUrlResult> {
	const {
		signal,
		follow,
		timestamps,
		grep,
		tail,
		json,
		label = 'stream',
		raw = false,
		v2 = false,
	} = options;
	const streamStart = Date.now();
	let bytesRead = 0;
	let chunks = 0;

	try {
		const fetchUrl = new URL(url);

		if (follow || v2) {
			fetchUrl.searchParams.set('v', '2');
		}
		if (follow) {
			fetchUrl.searchParams.set('follow', 'true');
		}

		const redactedUrl =
			fetchUrl.origin + fetchUrl.pathname + (fetchUrl.search ? '?REDACTED' : '');
		logger.debug('[%s] fetching: %s', label, redactedUrl);
		const response = await fetch(fetchUrl.href, { signal });
		logger.debug(
			'[%s] response status=%d in %dms',
			label,
			response.status,
			Date.now() - streamStart
		);

		if (!response.ok || !response.body) {
			logger.debug('[%s] not ok or no body', label);
			if (!json) {
				tui.error(`Failed to fetch stream: ${response.status} ${response.statusText}`);
			}
			throw new StreamFetchError(
				response.status,
				response.statusText,
				`Failed to fetch stream: ${response.status} ${response.statusText}`
			);
		}

		const reader = response.body.getReader();

		if (raw) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					logger.debug(
						'[%s] EOF after %dms (%d chunks, %d bytes)',
						label,
						Date.now() - streamStart,
						chunks,
						bytesRead
					);
					break;
				}

				if (value) {
					chunks++;
					bytesRead += value.length;
					if (chunks <= 3 || chunks % 100 === 0) {
						logger.debug(
							'[%s] chunk #%d: %d bytes (total: %d bytes, +%dms)',
							label,
							chunks,
							value.length,
							bytesRead,
							Date.now() - streamStart
						);
					}
					await writeAndDrain(writable, value);
				}
			}
		} else {
			const decoder = new TextDecoder();
			let leftover = '';
			const grepPattern = grep ? new RegExp(escapeRegExp(grep), 'i') : null;
			const needsFiltering = tail !== undefined || grepPattern !== null;
			const tailBuffer: string[] = [];
			const maxTail = tail ?? Infinity;
			const liveOutput = follow && needsFiltering;

			const outputLine = async (line: string) => {
				if (json) {
					const obj = {
						timestamp: new Date().toISOString(),
						stream: label,
						message: line,
					};
					await writeAndDrain(writable, Buffer.from(JSON.stringify(obj) + '\n'));
				} else {
					const formatted = timestamps ? formatLineWithTimestamp(line) : line;
					await writeAndDrain(writable, Buffer.from(formatted + '\n'));
				}
			};

			const processFilteredLine = async (line: string) => {
				if (grepPattern && !grepPattern.test(line)) {
					return;
				}
				if (tail !== undefined) {
					tailBuffer.push(line);
					if (tailBuffer.length > maxTail) {
						tailBuffer.shift();
					}
					if (liveOutput) {
						await outputLine(line);
					}
				} else {
					await outputLine(line);
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					if (leftover) {
						if (needsFiltering) {
							await processFilteredLine(leftover);
						} else {
							await outputLine(leftover);
						}
					}
					logger.debug(
						'[%s] EOF after %dms (%d chunks, %d bytes)',
						label,
						Date.now() - streamStart,
						chunks,
						bytesRead
					);
					break;
				}

				if (value) {
					chunks++;
					bytesRead += value.length;
					const text = leftover + decoder.decode(value, { stream: true });
					const lines = text.split('\n');
					leftover = lines.pop() ?? '';

					for (const line of lines) {
						if (needsFiltering) {
							await processFilteredLine(line);
						} else {
							await outputLine(line);
						}
					}
				}
			}

			if (!liveOutput && needsFiltering && tailBuffer.length > 0) {
				for (const line of tailBuffer) {
					await outputLine(line);
				}
			}
		}

		return { bytesRead, chunks };
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger.debug('[%s] aborted after %dms', label, Date.now() - streamStart);
			return { bytesRead, chunks };
		}
		logger.debug('[%s] error after %dms: %s', label, Date.now() - streamStart, err);
		throw err;
	}
}

function formatLineWithTimestamp(line: string): string {
	const timestamp = new Date().toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	return `${tui.muted(timestamp)} ${line}`;
}
