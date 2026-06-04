import { encodeSandboxOutputFrame } from './sandbox-output-protocol';

export function writeSandboxOutput(data: string): void {
	process.stdout.write(encodeSandboxOutputFrame({ type: 'stdout', data }));
}

export function writeSandboxError(error: unknown): void {
	writeSandboxOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
