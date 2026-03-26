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

async function main(): Promise<void> {
	const optionsPath = process.argv[2];
	if (!optionsPath) {
		throw new Error('Missing worker options file path argument');
	}

	const optionsFile = Bun.file(optionsPath);
	if (!(await optionsFile.exists())) {
		throw new Error(`Worker options file does not exist: ${optionsPath}`);
	}

	const options = JSON.parse(await optionsFile.text()) as ViteBuildWorkerOptions;

	await runViteBuild({
		...options,
		logger: createWorkerLogger(),
	});
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
