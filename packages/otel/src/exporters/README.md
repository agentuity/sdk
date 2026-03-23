# JSONL Exporters

Custom OpenTelemetry exporters that write telemetry data (logs, traces, metrics) to JSONL (JSON Lines) files instead of sending directly to an OTLP endpoint.

## Overview

These exporters write telemetry data to local files in JSONL format. Each line in the file represents a single telemetry item in JSON format. This allows for:

1. **Decoupled Processing**: Telemetry data is buffered locally and processed separately
2. **Reliability**: Data persists even if the OTLP endpoint is temporarily unavailable
3. **Batch Processing**: A separate cron job can read and send data in batches
4. **Easy Debugging**: JSONL files can be inspected directly

## How It Works

### 1. Writing Telemetry Data

The exporters write telemetry data to timestamped JSONL files:

- **Logs**: `./otel-data/logs-<timestamp>.jsonl`
- **Traces**: `./otel-data/traces-<timestamp>.jsonl`
- **Metrics**: `./otel-data/metrics-<timestamp>.jsonl`

Files are named with an ISO timestamp (with colons and periods replaced by hyphens) to ensure uniqueness. The exporters will continue writing to the same file as long as it exists.

### 2. Reading and Forwarding Data (External Process)

A separate cron job (recommended: every 30 seconds) should:

1. Read the JSONL files
2. Parse each line as a JSON object
3. Send the telemetry data to your OTLP endpoint
4. Delete the file after successful transmission

This decouples the application from the OTLP endpoint and provides resilience.

## Configuration

### Enabling JSONL Exporters

By default, JSONL exporters are enabled. You can configure them via the `OtelConfig`:

```typescript
import { registerOtel } from '@agentuity/runtime/otel';

registerOtel({
	name: 'my-app',
	version: '1.0.0',
	url: 'https://otel.example.com',
	useJsonlExporter: true, // Enable JSONL exporters (default: true)
	jsonlBasePath: './.agentuity/otel-data', // Directory for JSONL files
});
```

### Disabling JSONL Exporters

To use the original OTLP exporters (direct network calls):

```typescript
registerOtel({
	name: 'my-app',
	version: '1.0.0',
	url: 'https://otel.example.com',
	useJsonlExporter: false, // Disable JSONL, use OTLP directly
});
```

## File Format

### Logs

Each log entry contains:

```json
{
	"timestamp": [seconds, nanoseconds],
	"observedTimestamp": [seconds, nanoseconds],
	"severityNumber": 9,
	"severityText": "INFO",
	"body": "Log message",
	"attributes": { "key": "value" },
	"resource": { "@agentuity/orgId": "...", ... },
	"instrumentationScope": { "name": "...", "version": "..." },
	"spanContext": { "traceId": "...", "spanId": "...", ... }
}
```

### Traces

Each span contains:

```json
{
	"traceId": "...",
	"spanId": "...",
	"traceState": "...",
	"name": "operation-name",
	"kind": 1,
	"startTime": [seconds, nanoseconds],
	"endTime": [seconds, nanoseconds],
	"attributes": { "key": "value" },
	"status": { "code": 0 },
	"events": [],
	"links": [],
	"resource": { "@agentuity/orgId": "...", ... },
	"droppedAttributesCount": 0,
	"droppedEventsCount": 0,
	"droppedLinksCount": 0,
	"duration": [seconds, nanoseconds],
	"ended": true
}
```

### Metrics

Each metric batch contains:

```json
{
	"resource": { "@agentuity/orgId": "...", ... },
	"scopeMetrics": [
		{
			"scope": { "name": "...", "version": "..." },
			"metrics": [
				{
					"descriptor": { "name": "...", "description": "...", ... },
					"dataPointType": 0,
					"dataPoints": [...],
					"aggregationTemporality": 1
				}
			]
		}
	]
}
```

## Example Cron Job

Here's an example script that reads JSONL files and forwards them to OTLP:

```typescript
#!/usr/bin/env bun

import { readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const OTEL_ENDPOINT = process.env.OTEL_ENDPOINT || 'https://otel.agentuity.cloud';
const OTEL_TOKEN = process.env.OTEL_TOKEN;
const DATA_DIR = process.env.DATA_DIR || './.agentuity/otel-data';

async function processFiles() {
	const files = await readdir(DATA_DIR);

	for (const file of files) {
		if (file.endsWith('.jsonl')) {
			const filePath = join(DATA_DIR, file);
			const content = await readFile(filePath, 'utf-8');
			const lines = content.trim().split('\n');

			const type = file.startsWith('logs-')
				? 'logs'
				: file.startsWith('traces-')
					? 'traces'
					: 'metrics';

			try {
				// Send to OTLP endpoint
				await fetch(`${OTEL_ENDPOINT}/v1/${type}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${OTEL_TOKEN}`,
					},
					body: JSON.stringify({ [type]: lines.map((line) => JSON.parse(line)) }),
				});

				// Delete file after successful transmission
				await unlink(filePath);
				console.log(`Processed and deleted ${file}`);
			} catch (error) {
				console.error(`Failed to process ${file}:`, error);
				// Don't delete the file on error, will retry next time
			}
		}
	}
}

processFiles().catch(console.error);
```

Add this to your crontab to run every 30 seconds:

```bash
* * * * * /path/to/process-otel-data.ts
* * * * * sleep 30 && /path/to/process-otel-data.ts
```

## Exporters

### JSONLLogExporter

Implements `LogRecordExporter` interface.

### JSONLTraceExporter

Implements `SpanExporter` interface.

### JSONLMetricExporter

Implements `PushMetricExporter` interface.

## Notes

- Files are written synchronously using `appendFileSync` for simplicity and reliability
- File existence is checked before each write, creating a new file if necessary
- Timestamps in filenames use ISO format with special characters replaced by hyphens
- The exporters handle errors gracefully and report them via the callback mechanism
