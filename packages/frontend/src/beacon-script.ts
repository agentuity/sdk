/**
 * This file is a placeholder for TypeScript compilation.
 * The actual BEACON_SCRIPT value is generated at build time by scripts/build-beacon.ts
 * and written directly to dist/beacon-script.js, overwriting the compiled output.
 *
 * This allows TypeScript to generate proper .d.ts files during compilation,
 * while the actual minified beacon code is injected during the build step.
 */

export const BEACON_SCRIPT: string = '';

/**
 * Validates that the beacon script has been properly injected at build time.
 * Call this early in the runtime to fail fast if the build step was missed.
 * @throws Error if BEACON_SCRIPT is empty (build step not run)
 */
export function validateBeaconScript(): void {
	if (!BEACON_SCRIPT || BEACON_SCRIPT.length === 0) {
		throw new Error(
			'BEACON_SCRIPT is empty. The frontend package was not built correctly. ' +
				'Run "bun run build" in @agentuity/frontend to generate the beacon script.'
		);
	}
}
