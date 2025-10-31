import { SeverityNumber } from '@opentelemetry/api-logs';
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { createLogger } from '@agentuity/server';
import type { Logger } from '@agentuity/core';

/**
 * Console implementation of the LogRecordExporter interface
 */
export class ConsoleLogRecordExporter implements LogRecordExporter {
	private readonly logger: Logger;

	/**
	 * Creates a new console log record exporter
	 */
	constructor() {
		this.logger = createLogger('info', false, 'dark');
	}

	/**
	 * Exports log records to the console
	 *
	 * @param logs - The log records to export
	 * @param resultCallback - Callback function to report the export result
	 */
	export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
		for (const log of logs) {
			switch (log.severityNumber) {
				case SeverityNumber.DEBUG:
					this.logger.debug(log.body);
					break;
				case SeverityNumber.INFO:
					this.logger.info(log.body);
					break;
				case SeverityNumber.WARN:
					this.logger.warn(log.body);
					break;
				case SeverityNumber.ERROR:
					this.logger.error(log.body);
					break;
				default:
					this.logger.info(log.body);
					break;
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
