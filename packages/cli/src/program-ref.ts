import type { Command } from 'commander';

let programRef: Command | null = null;

export function setProgram(program: Command): void {
	programRef = program;
}

export function getProgram(): Command | null {
	return programRef;
}
