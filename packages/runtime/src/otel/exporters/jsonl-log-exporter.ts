import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * JSONL implementation of the LogRecordExporter interface
 * Writes logs to a timestamped JSONL file
 */
export class JSONLLogExporter implements LogRecordExporter {
	private currentFile: string | null = null;
	private readonly basePath: string;
	private readonly filePrefix: string;

	/**
	 * Creates a new JSONL log record exporter
	 * @param basePath - Directory to store the JSONL files
	 */
	constructor(basePath: string) {
		this.basePath = basePath;
		this.filePrefix = 'logs';
		this.ensureDirectory();
	}

	private ensureDirectory(): void {
		if (!existsSync(this.basePath)) {
			mkdirSync(this.basePath, { recursive: true });
		}
	}

	private getOrCreateFile(): string {
		// If current file exists, use it
		if (this.currentFile && existsSync(this.currentFile)) {
			return this.currentFile;
		}

		// Create new file with timestamp
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		this.currentFile = join(this.basePath, `${this.filePrefix}-${timestamp}.jsonl`);
		return this.currentFile;
	}

	/**
	 * Exports log records to a JSONL file
	 *
	 * @param logs - The log records to export
	 * @param resultCallback - Callback function to report the export result
	 */
	export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
		try {
			if (logs.length === 0) {
				resultCallback({ code: ExportResultCode.SUCCESS });
				return;
			}
			const file = this.getOrCreateFile();
			const lines: string[] = [];
			for (const log of logs) {
				const record = {
					timestamp: log.hrTime,
					observedTimestamp: log.hrTimeObserved,
					severityNumber: log.severityNumber,
					severityText: log.severityText,
					body: log.body,
					attributes: log.attributes,
					resource: log.resource.attributes,
					instrumentationScope: log.instrumentationScope,
					spanContext: log.spanContext,
				};

				lines.push(JSON.stringify(record));
			}
			const payload = `${lines.join('\n')}\n`;
			try {
				appendFileSync(file, payload, 'utf-8');
			} catch (err) {
				// File may have been deleted, reset and retry once
				const code = (err as NodeJS.ErrnoException).code;
				if (code === 'ENOENT') {
					this.currentFile = null;
					const newFile = this.getOrCreateFile();
					appendFileSync(newFile, payload, 'utf-8');
				} else {
					throw err;
				}
			}

			resultCallback({ code: ExportResultCode.SUCCESS });
		} catch (error) {
			resultCallback({
				code: ExportResultCode.FAILED,
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	}

	/**
	 * Shuts down the exporter
	 *
	 * @returns A promise that resolves when shutdown is complete
	 */
	async shutdown(): Promise<void> {
		this.currentFile = null;
	}

	/**
	 * Forces a flush of any pending data
	 */
	async forceFlush(): Promise<void> {
		// No-op for file-based exporter as writes are synchronous
	}
}
