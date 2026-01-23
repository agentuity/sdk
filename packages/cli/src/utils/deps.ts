import { $ } from 'bun';
import type { Logger } from '../types';

export interface PackageRef {
	name: string;
	version: string;
}

export async function extractDependencies(
	projectDir: string,
	logger: Logger
): Promise<PackageRef[]> {
	try {
		logger.debug('Extracting dependencies using bun pm ls --all');

		const result = await $`bun pm ls --all`.cwd(projectDir).quiet().nothrow();

		if (result.exitCode !== 0) {
			logger.warn(
				'Failed to extract dependencies: bun pm ls exited with code %d',
				result.exitCode
			);
			return [];
		}

		const output = result.stdout.toString();
		const packages = parseBunPmLsOutput(output);

		logger.debug('Extracted %d unique packages', packages.length);
		return packages;
	} catch (error) {
		logger.warn('Failed to extract dependencies: %s', error);
		return [];
	}
}

export function parseBunPmLsOutput(output: string): PackageRef[] {
	const packages = new Map<string, PackageRef>();
	const lines = output.split('\n');

	for (const line of lines) {
		const match = line.match(/([^\s]+)@(\d+\.\d+\.\d+[^\s]*)/);
		if (match) {
			const name = match[1];
			const version = match[2];
			const key = `${name}@${version}`;
			if (!packages.has(key)) {
				packages.set(key, { name, version });
			}
		}
	}

	return Array.from(packages.values());
}
