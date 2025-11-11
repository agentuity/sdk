import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * JSONL implementation of the SpanExporter interface
 * Writes traces to a timestamped JSONL file
 */
export class JSONLTraceExporter implements SpanExporter {
	private currentFile: string | null = null;
	private readonly basePath: string;
	private readonly filePrefix: string;

	/**
	 * Creates a new JSONL trace exporter
	 * @param basePath - Directory to store the JSONL files
	 */
	constructor(basePath: string) {
		this.basePath = basePath;
		this.filePrefix = 'otel-trace';
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

		this.currentFile = join(
			this.basePath,
			`${this.filePrefix}-${Date.now()}.${randomUUID()}.jsonl`
		);
		return this.currentFile;
	}

	/**
	 * Exports spans to a JSONL file
	 *
	 * @param spans - The spans to export
	 * @param resultCallback - Callback function to report the export result
	 */
	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		try {
			if (spans.length === 0) {
				resultCallback({ code: ExportResultCode.SUCCESS });
				return;
			}
			const file = this.getOrCreateFile();
			const lines: string[] = [];
			for (const span of spans) {
				const record = {
					traceId: span.spanContext().traceId,
					spanId: span.spanContext().spanId,
					traceState: span.spanContext().traceState?.serialize(),
					name: span.name,
					kind: span.kind,
					startTime: span.startTime,
					endTime: span.endTime,
					attributes: span.attributes,
					status: span.status,
					events: span.events,
					links: span.links,
					resource: span.resource.attributes,
					droppedAttributesCount: span.droppedAttributesCount,
					droppedEventsCount: span.droppedEventsCount,
					droppedLinksCount: span.droppedLinksCount,
					duration: span.duration,
					ended: span.ended,
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
