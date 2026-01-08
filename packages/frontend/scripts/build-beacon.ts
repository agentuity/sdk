/**
 * Build script to create the minified analytics beacon
 * This runs as part of the frontend package build and creates dist/beacon.js
 */

import { join, dirname } from 'node:path';

const srcDir = join(dirname(import.meta.dir), 'src');
const distDir = join(dirname(import.meta.dir), 'dist');

const beaconEntryPath = join(srcDir, 'analytics', 'beacon-standalone.ts');
const beaconOutputPath = join(distDir, 'beacon.js');

async function buildBeacon() {
	console.log('Building analytics beacon...');

	const result = await Bun.build({
		entrypoints: [beaconEntryPath],
		minify: true,
		target: 'browser',
		format: 'iife',
	});

	if (!result.success) {
		const errors = result.logs.map((log) => log.message).join('\n');
		console.error('Failed to build beacon:', errors);
		process.exit(1);
	}

	const output = result.outputs[0];
	if (!output) {
		console.error('No output from beacon build');
		process.exit(1);
	}

	const beaconCode = await output.text();

	// Write the minified beacon as a JS file
	await Bun.write(beaconOutputPath, beaconCode);

	// Also write it as a TypeScript module that exports the string
	const beaconModulePath = join(distDir, 'beacon-script.js');
	const moduleContent = `// Auto-generated - do not edit
// Minified analytics beacon script
export const BEACON_SCRIPT = ${JSON.stringify(beaconCode)};
`;
	await Bun.write(beaconModulePath, moduleContent);

	// Write the .d.ts file
	const beaconDtsPath = join(distDir, 'beacon-script.d.ts');
	const dtsContent = `// Auto-generated - do not edit
export declare const BEACON_SCRIPT: string;
`;
	await Bun.write(beaconDtsPath, dtsContent);

	console.log(`Built beacon: ${beaconCode.length} bytes`);
	console.log(`Output: ${beaconOutputPath}`);
	console.log(`Module: ${beaconModulePath}`);
}

buildBeacon();
