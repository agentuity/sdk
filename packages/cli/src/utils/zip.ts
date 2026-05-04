import { createWriteStream, lstatSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import archiver from 'archiver';
import { glob } from 'tinyglobby';
import { toForwardSlash } from './normalize-path.ts';

interface Options {
	progress?: (val: number) => void;
	filter?: (filename: string, relative: string) => boolean;
}

export async function zipDir(dir: string, outdir: string, options?: Options) {
	await mkdir(dirname(outdir), { recursive: true });
	const output = createWriteStream(outdir);
	const zip = archiver('zip', {
		zlib: { level: 9 },
	});

	const writeDone = new Promise<void>((resolve, reject) => {
		output.on('close', resolve);
		output.on('error', reject);
		zip.on('error', reject);
	});

	zip.pipe(output);

	const files = await glob(['**/*'], {
		cwd: dir,
		absolute: true,
		dot: true,
		followSymbolicLinks: false,
	});
	const total = files.length;
	let count = 0;
	for (const file of files) {
		const rel = toForwardSlash(relative(dir, file));
		let skip = false;
		if (options?.filter) {
			if (!options.filter(file, rel)) {
				skip = true;
			}
		}
		if (!skip) {
			try {
				// Skip symlinks and directories — symlinks are workspace artefacts
				// (e.g. bun's node_modules links) that cannot be resolved portably
				// across machines and would cause EISDIR errors on extraction.
				const stat = lstatSync(file);
				if (!stat.isSymbolicLink() && !stat.isDirectory()) {
					// Set explicit Unix permissions (0o644) for portability across OSes.
					zip.file(file, { name: rel, mode: 0o644 });
				}
			} catch (err) {
				throw new Error(`Failed to add file to zip: ${rel} (${file})`, { cause: err });
			}
		}
		count++;
		if (options?.progress) {
			const progress = Math.floor((count / total) * 100);
			options.progress(progress);
			await sleep(10); // give some time for the progress bar to render
		}
	}
	await zip.finalize();
	await writeDone;
	if (options?.progress) {
		options.progress(100);
		await sleep(100); // give some time for the progress bar to render
	}
}
