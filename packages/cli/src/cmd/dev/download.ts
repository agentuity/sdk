import { randomUUID } from 'node:crypto';
import { existsSync, createReadStream, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import * as tar from 'tar';
import { downloadRelease } from '@terascope/fetch-github-release';
import { spinner } from '../../tui';

const user = 'agentuity';
const repo = 'gravity';

function filterRelease(release: { prerelease: boolean }) {
	// Filter out prereleases.
	return release.prerelease === false;
}

function filterAsset(asset: { name: string }): boolean {
	// Filter out the release matching our os and architecture
	let arch: string = process.arch;
	if (arch === 'x64') {
		arch = 'x86_64';
	}
	return asset.name.includes(arch) && asset.name.includes(platform());
}

interface GravityClient {
	filename: string;
	version: string;
}

/**
 *
 * @returns full path to the downloaded file
 */
export async function download(gravityDir: string): Promise<GravityClient> {
	const outputdir = join(tmpdir(), randomUUID());

	const res = (await spinner({
		message: 'Checking Agentuity Gravity',
		callback: async () => {
			return downloadRelease(
				user,
				repo,
				outputdir,
				filterRelease,
				filterAsset,
				false,
				true,
				true,
				''
			);
		},
		clearOnSuccess: true,
	})) as { release: string; assetFileNames: string[] };

	const versionTok = res.release.split('@');
	const version = versionTok[1];
	const releaseFilename = join(gravityDir, version, 'gravity');
	const mustDownload = !existsSync(releaseFilename);

	if (!mustDownload) {
		return { filename: releaseFilename, version };
	}

	const downloadedFile = await spinner({
		message: `Downloading Gravity ${version}`,
		callback: async () => {
			const res = (await downloadRelease(
				user,
				repo,
				outputdir,
				filterRelease,
				filterAsset,
				false,
				true,
				false,
				''
			)) as string[];
			return res[0] as string;
		},
		clearOnSuccess: true,
	});

	if (downloadedFile.endsWith('.tar.gz')) {
		await spinner({
			message: 'Extracting release',
			callback: async () => {
				return new Promise<void>((resolve, reject) => {
					const input = createReadStream(downloadedFile);
					const downloadDir = dirname(releaseFilename);
					if (!existsSync(downloadDir)) {
						mkdirSync(downloadDir, { recursive: true });
					}
					input.on('finish', resolve);
					input.on('end', resolve);
					input.on('error', reject);
					input.pipe(tar.x({ C: downloadDir, chmod: true }));
				});
			},
			clearOnSuccess: true,
		});
	} else {
		// TODO:
	}

	if (existsSync(outputdir)) {
		rmSync(outputdir, { recursive: true });
	}

	return { filename: releaseFilename, version };
}
