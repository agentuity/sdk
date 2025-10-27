import { semver } from 'bun';

const MIN_BUN_VERSION = '1.3.0';

export function isBun(): boolean {
	return typeof Bun !== 'undefined';
}

export function validateRuntime(): void {
	if (!isBun()) {
		console.error('Error: This CLI requires Bun runtime');
		console.error('Please install Bun: https://bun.sh');
		process.exit(1);
	}

	const bunVersion = Bun.version;
	if (semver.satisfies(bunVersion, `>=${MIN_BUN_VERSION}`) === false) {
		console.error(`Error: This CLI requires Bun ${MIN_BUN_VERSION} or higher`);
		console.error(`Current Bun version: ${bunVersion}`);
		process.exit(1);
	}
}
