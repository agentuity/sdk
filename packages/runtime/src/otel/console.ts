import { SeverityNumber } from '@opentelemetry/api-logs';
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { __originalConsole } from './logger';

/**
 * Console implementation of the LogRecordExporter interface
 * Uses __originalConsole to avoid infinite loop when console is patched
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
		for (const log of logs) {
			if (this.dumpRecords) {
				__originalConsole.log('[LOG]', {
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
						__originalConsole.debug(msg);
						break;
					case SeverityNumber.INFO:
						__originalConsole.info(msg);
						break;
					case SeverityNumber.WARN:
						__originalConsole.warn(msg);
						break;
					case SeverityNumber.ERROR:
						__originalConsole.error(msg);
						break;
					default:
						__originalConsole.log(msg);
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
}

/**
 * Console implementation of the SpanExporter interface
 * Uses __originalConsole to avoid infinite loop when console is patched
 */
export class DebugSpanExporter implements SpanExporter {
	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		for (const span of spans) {
			__originalConsole.log('[SPAN]', {
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
