import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import {
	type PushMetricExporter,
	type ResourceMetrics,
	AggregationTemporality,
	InstrumentType,
} from '@opentelemetry/sdk-metrics';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * JSONL implementation of the PushMetricExporter interface
 * Writes metrics to a timestamped JSONL file
 */
export class JSONLMetricExporter implements PushMetricExporter {
	private currentFile: string | null = null;
	private readonly basePath: string;
	private readonly filePrefix: string;

	/**
	 * Creates a new JSONL metric exporter
	 * @param basePath - Directory to store the JSONL files
	 */
	constructor(basePath: string) {
		this.basePath = basePath;
		this.filePrefix = 'metrics';
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
	 * Exports metrics to a JSONL file
	 *
	 * @param metrics - The resource metrics to export
	 * @param resultCallback - Callback function to report the export result
	 */
	export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
		try {
			const file = this.getOrCreateFile();

			const record = {
				resource: metrics.resource.attributes,
				scopeMetrics: metrics.scopeMetrics.map((sm) => ({
					scope: sm.scope,
					metrics: sm.metrics.map((m) => ({
						descriptor: m.descriptor,
						dataPointType: m.dataPointType,
						dataPoints: m.dataPoints,
						aggregationTemporality: m.aggregationTemporality,
					})),
				})),
			};

			const line = JSON.stringify(record) + '\n';
			try {
				appendFileSync(file, line, 'utf-8');
			} catch (err) {
				// File may have been deleted, reset and retry once
				const code = (err as NodeJS.ErrnoException).code;
				if (code === 'ENOENT') {
					this.currentFile = null;
					const newFile = this.getOrCreateFile();
					appendFileSync(newFile, line, 'utf-8');
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

	/**
	 * Selects the aggregation temporality for the given instrument type
	 */
	selectAggregationTemporality?(_instrumentType: InstrumentType): AggregationTemporality {
		// Default to cumulative temporality
		return AggregationTemporality.CUMULATIVE;
	}
}
