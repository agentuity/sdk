const processes = [
	Bun.spawn(['bun', 'run', 'server:api'], {
		stdout: 'inherit',
		stderr: 'inherit',
	}),
	Bun.spawn(['bun', 'run', 'dev:web'], {
		stdout: 'inherit',
		stderr: 'inherit',
	}),
];

let shuttingDown = false;

function stop(exitCode: number): void {
	if (shuttingDown) return;
	shuttingDown = true;

	for (const child of processes) {
		child.kill();
	}

	process.exit(exitCode);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => stop(0));
}

const exitCode = await Promise.race(processes.map((child) => child.exited));
stop(exitCode ?? 0);
