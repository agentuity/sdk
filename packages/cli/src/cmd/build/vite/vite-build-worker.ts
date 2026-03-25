import { format } from 'node:util';
import type { Logger } from '../../../types';
import { runViteBuild, type ViteBuildWorkerOptions } from './vite-builder';

function createWorkerLogger(): Logger {
	const write = (writer: (...args: unknown[]) => void, args: unknown[]) => {
		writer(format(...args));
	};
	let loggerRef: Logger;

	loggerRef = {
		trace: (...args: unknown[]) => write(console.debug, args),
		debug: (...args: unknown[]) => write(console.debug, args),
		info: (...args: unknown[]) => write(console.log, args),
		warn: (...args: unknown[]) => write(console.warn, args),
		error: (...args: unknown[]) => write(console.error, args),
		child: () => loggerRef,
		fatal: (...args: unknown[]) => {
			const message = format(...args);
			console.error(message);
			throw new Error(message);
		},
	};

	return loggerRef;
}

async function logMemoryDiagnostics(label: string): Promise<void> {
	try {
		const { heapStats } = await import('bun:jsc');
		const stats = heapStats();
		const heapMb = Math.round(Number(stats.heapSize) / 1024 / 1024);
		const capacityMb = Math.round(Number(stats.heapCapacity) / 1024 / 1024);
		const objectCount = stats.objectCount;
		console.log(
			`[${label}] JSC heap: size=${heapMb} MiB, capacity=${capacityMb} MiB, objects=${objectCount}`
		);
	} catch {
		// bun:jsc may not be available
	}

	// Log process RSS from /proc/self/status on Linux
	try {
		const status = Bun.file('/proc/self/status');
		if (await status.exists()) {
			const text = await status.text();
			const vmRss = text.match(/VmRSS:\s+(\d+)/);
			const vmPeak = text.match(/VmPeak:\s+(\d+)/);
			if (vmRss) {
				console.log(
					`[${label}] Process RSS: ${Math.round(Number(vmRss[1]) / 1024)} MiB, Peak: ${vmPeak ? Math.round(Number(vmPeak[1]) / 1024) : '?'} MiB`
				);
			}
		}
	} catch {
		// Not on Linux
	}
}

async function main(): Promise<void> {
	const optionsPath = process.argv[2];
	if (!optionsPath) {
		throw new Error('Missing worker options file path argument');
	}

	// Log env vars and initial memory state for diagnostics
	console.log(
		`BUN_JSC_forceRAMSize=${process.env.BUN_JSC_forceRAMSize ?? 'unset'}, BUN_JSC_gcMaxHeapSize=${process.env.BUN_JSC_gcMaxHeapSize ?? 'unset'}`
	);
	await logMemoryDiagnostics('startup');

	const optionsFile = Bun.file(optionsPath);
	if (!(await optionsFile.exists())) {
		throw new Error(`Worker options file does not exist: ${optionsPath}`);
	}

	const options = JSON.parse(await optionsFile.text()) as ViteBuildWorkerOptions;

	await runViteBuild({
		...options,
		logger: createWorkerLogger(),
	});

	await logMemoryDiagnostics('complete');
}

void main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[vite-build-worker] ${message}`);
		if (error instanceof Error && error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	});
