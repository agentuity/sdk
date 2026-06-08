import { parseSandboxOutputLine } from '../../lib/sandbox-output-protocol';

export interface SSEStream {
	writeSSE(event: { event: string; data: string }): Promise<void>;
}

export interface SandboxOutputForwarder {
	push(text: string): void;
	flush(): Promise<void>;
	hasOutput(): boolean;
}

export function createSandboxOutputForwarder(sseStream: SSEStream): SandboxOutputForwarder {
	let lineBuffer = '';
	let hasOutput = false;
	let pendingWrite: Promise<void> = Promise.resolve();

	const emit = (text: string): void => {
		hasOutput = true;
		if (!text) return;
		const encoded = text.replace(/\n/g, '\\n');
		pendingWrite = pendingWrite.then(() =>
			sseStream.writeSSE({ event: 'stdout', data: encoded }).catch(() => {})
		);
	};

	const processLine = (line: string): void => {
		const frame = parseSandboxOutputLine(line);
		if (frame) emit(frame.data);
	};

	return {
		push(text: string): void {
			if (!text) return;

			lineBuffer += text;
			while (true) {
				const newlineIndex = lineBuffer.indexOf('\n');
				if (newlineIndex === -1) break;

				const line = lineBuffer.slice(0, newlineIndex).replace(/\r$/, '');
				lineBuffer = lineBuffer.slice(newlineIndex + 1);
				processLine(line);
			}
		},
		async flush(): Promise<void> {
			if (lineBuffer) {
				processLine(lineBuffer.replace(/\r$/, ''));
				lineBuffer = '';
			}
			await pendingWrite;
		},
		hasOutput(): boolean {
			return hasOutput;
		},
	};
}
