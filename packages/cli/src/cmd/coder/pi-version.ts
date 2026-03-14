import { semver } from 'bun';

export const SUPPORTED_PI_VERSION_RANGE = '>=0.58.1 <0.59.0';

export interface PiVersionInfo {
	raw: string;
	version: string | null;
	supported: boolean | null;
}

export function extractPiVersion(output: string): string | null {
	const trimmed = output.trim();
	if (!trimmed) return null;

	const match = trimmed.match(/(?:^|[^\d])v?(\d+\.\d+\.\d+)\b/);
	return match?.[1] ?? null;
}

export function isSupportedPiVersion(version: string): boolean {
	return semver.satisfies(version, SUPPORTED_PI_VERSION_RANGE);
}

export function inspectPiBinaryVersion(piBinary: string): PiVersionInfo | null {
	try {
		const result = Bun.spawnSync([piBinary, '--version'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});

		if (
			!result.success &&
			result.exitCode !== 0 &&
			result.stdout.length === 0 &&
			result.stderr.length === 0
		) {
			return null;
		}

		const stdout = new TextDecoder().decode(result.stdout);
		const stderr = new TextDecoder().decode(result.stderr);
		const raw = `${stdout}\n${stderr}`.trim();
		const version = extractPiVersion(raw);

		return {
			raw,
			version,
			supported: version ? isSupportedPiVersion(version) : null,
		};
	} catch {
		return null;
	}
}
