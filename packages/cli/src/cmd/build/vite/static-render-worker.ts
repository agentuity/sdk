import { format } from 'node:util';
import type { Logger } from '../../../types';
import { runStaticRender } from './static-renderer';

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

export interface StaticRenderWorkerOptions {
	rootDir: string;
}

async function main(): Promise<void> {
	const optionsPath = process.argv[2];
	if (!optionsPath) {
		throw new Error('Missing worker options file path argument');
	}

	const optionsFile = Bun.file(optionsPath);
	if (!(await optionsFile.exists())) {
		throw new Error(`Worker options file does not exist: ${optionsPath}`);
	}

	const options = JSON.parse(await optionsFile.text()) as StaticRenderWorkerOptions;
	const logger = createWorkerLogger();

	// Load user plugins from agentuity.config.ts (can't serialize plugin functions)
	const { loadAgentuityConfig } = await import('./config-loader');
	const config = await loadAgentuityConfig(options.rootDir, logger);
	const userPlugins = config?.plugins || [];

	const result = await runStaticRender({
		rootDir: options.rootDir,
		logger,
		userPlugins,
	});

	// Write result to stdout for parent to parse
	console.log(JSON.stringify(result));
}

void main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[static-render-worker] ${message}`);
		if (error instanceof Error && error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	});
