import { $, semver } from 'bun';
import { StructuredError } from '@agentuity/core';
import * as tui from '../tui';
import { pauseStepUI } from '../steps';

const InvalidBunVersion = StructuredError('InvalidBunVersion')<{
	current: string;
	required: string;
	message: string;
}>();

const MIN_BUN_VERSION = '>=1.3.3';

/**
 * Check if Bun version meets minimum requirements and optionally upgrade
 * @returns Array of output messages (empty if version OK, success message if upgraded)
 * @throws InvalidBunVersion if version check fails
 */
export async function checkBunVersion(): Promise<string[]> {
	if (semver.satisfies(Bun.version, MIN_BUN_VERSION)) {
		return []; // Version is OK, no output needed
	}

	const message = `Bun is using version ${Bun.version}. This project requires Bun version ${MIN_BUN_VERSION} to build.`;

	if (process.stdin.isTTY && process.stdout.isTTY) {
		// Pause the step UI for interactive prompt
		const resume = pauseStepUI();

		tui.warning(message);
		const ok = await tui.confirm('Would you like to upgrade now?');

		// Small delay to ensure console.log('') in confirm completes
		await new Promise((resolve) => setTimeout(resolve, 10));

		resume(); // Resume step UI

		if (ok) {
			await $`bun upgrade`.quiet();
			const version = (await $`bun -v`.quiet().text()).trim();
			// Return success message to show in output box
			return [tui.colorSuccess(`Upgraded Bun to ${version}`)];
		}
	}

	// Failed to upgrade or user declined
	throw new InvalidBunVersion({
		current: Bun.version,
		required: MIN_BUN_VERSION,
		message,
	});
}

/**
 * Get minimum required Bun version
 */
export function getMinBunVersion(): string {
	return MIN_BUN_VERSION;
}
