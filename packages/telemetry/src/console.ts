import { SeverityNumber } from '@opentelemetry/api-logs';
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { getOriginalConsole } from './globals';

/**
 * Console implementation of the LogRecordExporter interface
 * Uses the native console snapshot to avoid infinite loop when console is patched
 */
export class ConsoleLogRecordExporter implements LogRecordExporter {
	private dumpRecords = false;

	constructor(dumpRecords: boolean) {
		this.dumpRecords = dumpRecords;
	}
	/**
	 * Exports log records to the console
	 *
	 * @param logs - The log records to export
	 * @param resultCallback - Callback function to report the export result
	 */
	export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
		const original = getOriginalConsole();
		for (const log of logs) {
			if (this.dumpRecords) {
				original.log('[LOG]', {
					body: log.body,
					severityNumber: log.severityNumber,
					severityText: log.severityText,
					timestamp: log.hrTime,
					attributes: log.attributes,
					resource: log.resource.attributes,
				});
			} else {
				const severity = log.severityNumber ? SeverityNumber[log.severityNumber] : 'INFO';
				const msg = `[${severity}] ${log.body}`;
				switch (log.severityNumber) {
					case SeverityNumber.DEBUG:
						original.debug(msg);
						break;
					case SeverityNumber.INFO:
						original.info(msg);
						break;
					case SeverityNumber.WARN:
						original.warn(msg);
						break;
					case SeverityNumber.ERROR:
						original.error(msg);
						break;
					default:
						original.log(msg);
						break;
				}
			}
		}
		resultCallback({ code: ExportResultCode.SUCCESS });
	}

	/**
	 * Shuts down the exporter
	 *
	 * @returns A promise that resolves when shutdown is complete
	 */
	shutdown(): Promise<void> {
		return Promise.resolve();
	}

	forceFlush(): Promise<void> {
		return Promise.resolve();
	}
}

/**
 * Console implementation of the SpanExporter interface
 * Uses the native console snapshot to avoid infinite loop when console is patched
 */
export class DebugSpanExporter implements SpanExporter {
	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		const original = getOriginalConsole();
		for (const span of spans) {
			original.log('[SPAN]', {
				name: span.name,
				traceId: span.spanContext().traceId,
				spanId: span.spanContext().spanId,
				duration: span.duration,
				status: span.status,
				attributes: span.attributes,
			});
		}
		resultCallback({ code: ExportResultCode.SUCCESS });
	}

	shutdown(): Promise<void> {
		return Promise.resolve();
	}
}
