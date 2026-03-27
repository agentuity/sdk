import { writeAndDrain } from '@agentuity/server';
import type { Logger } from '@agentuity/core';
import * as tui from '../tui';

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

		logger.debug('[%s] fetching: %s', label, fetchUrl.href);
		const response = await fetch(fetchUrl.href, { signal });
		logger.debug(
			'[%s] response status=%d in %dms',
			label,
			response.status,
			Date.now() - streamStart
		);

		if (!response.ok || !response.body) {
			logger.debug('[%s] not ok or no body — returning', label);
			if (!json) {
				tui.error(`Failed to fetch stream: ${response.status} ${response.statusText}`);
			}
			return { bytesRead, chunks };
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
			const lines: string[] = [];
			const grepPattern = grep ? new RegExp(grep, 'i') : null;
			const needsFiltering = tail !== undefined || grepPattern !== null;

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
					const text = new TextDecoder().decode(value);

					if (needsFiltering) {
						for (const line of text.split('\n')) {
							if (line.trim()) {
								if (grepPattern && !grepPattern.test(line)) {
									continue;
								}
								lines.push(line);
							}
						}
					} else {
						for (const line of text.split('\n')) {
							if (line.trim()) {
								const outputLine = timestamps ? formatLineWithTimestamp(line) : line;
								await writeAndDrain(writable, Buffer.from(outputLine + '\n'));
							}
						}
					}
				}
			}

			if (needsFiltering && lines.length > 0) {
				const outputLines = tail !== undefined ? lines.slice(-tail) : lines;
				for (const line of outputLines) {
					const outputLine = timestamps ? formatLineWithTimestamp(line) : line;
					await writeAndDrain(writable, Buffer.from(outputLine + '\n'));
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
