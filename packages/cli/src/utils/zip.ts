import { createWriteStream, lstatSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { StructuredError } from '@agentuity/core';
import { ZipFile } from 'yazl';
import { glob } from 'tinyglobby';
import { toForwardSlash } from './normalize-path.ts';

const ZipAddFileError = StructuredError('ZipAddFileError');

/** Why a globbed path was not written into the zip (or was). */
export type ZipEntryAction = 'add' | 'skip-filter' | 'skip-symlink' | 'skip-directory';

export interface ZipEntryInfo {
	/** Posix path relative to the zip source directory. */
	relative: string;
	action: ZipEntryAction;
	/** Absolute source path on disk. */
	absolute: string;
}

export interface ZipDirResult {
	/** Number of files written into the archive. */
	added: number;
	/** Number of candidates skipped (filter / symlink / directory). */
	skipped: number;
	/** Absolute path of the written zip file. */
	outputPath: string;
}

interface Options {
	progress?: (val: number) => void;
	filter?: (filename: string, relative: string) => boolean;
	/**
	 * Invoked for every globbed path after the filter/stat decision.
	 * Used for trace-level packaging diagnostics.
	 */
	onEntry?: (info: ZipEntryInfo) => void;
}

export async function zipDir(
	dir: string,
	outdir: string,
	options?: Options
): Promise<ZipDirResult> {
	await mkdir(dirname(outdir), { recursive: true });
	const output = createWriteStream(outdir);
	const zip = new ZipFile();

	const writeDone = new Promise<void>((resolve, reject) => {
		output.on('close', resolve);
		output.on('error', reject);
		zip.on('error', reject);
	});

	zip.outputStream.pipe(output);

	// onlyFiles:false includes directory entries (skipped below).
	// followSymbolicLinks:true surfaces symlink paths so we can skip them;
	// we never add symlink targets as archive members.
	const files = await glob(['**/*'], {
		cwd: dir,
		absolute: true,
		dot: true,
		onlyFiles: false,
		followSymbolicLinks: true,
	});
	const total = files.length;
	let count = 0;
	let added = 0;
	let skipped = 0;
	const onEntry = options?.onEntry;
	const filter = options?.filter;
	const progress = options?.progress;
	for (const file of files) {
		// tinyglobby may suffix directory paths with `/`.
		const rel = toForwardSlash(relative(dir, file)).replace(/\/+$/, '');
		if (!rel || rel === '.') continue;
		if (filter && !filter(file, rel)) {
			skipped++;
			onEntry?.({ relative: rel, action: 'skip-filter', absolute: file });
		} else {
			// Skip symlinks and directories — symlinks are workspace artefacts
			// (e.g. bun's node_modules links) that cannot be resolved portably
			// across machines and would cause EISDIR errors on extraction.
			let action: ZipEntryAction;
			try {
				const stat = lstatSync(file);
				if (stat.isSymbolicLink()) {
					action = 'skip-symlink';
				} else if (stat.isDirectory()) {
					action = 'skip-directory';
				} else {
					// Set explicit Unix permissions (0o644) for portability across OSes.
					zip.addFile(file, rel, { mode: 0o644 });
					action = 'add';
				}
			} catch (err) {
				throw new ZipAddFileError({
					message: `Failed to add file to zip: ${rel} (${file})`,
					cause: err,
				});
			}
			// onEntry is outside the try so callback errors propagate as-is.
			if (action === 'add') {
				added++;
				onEntry?.({ relative: rel, action: 'add', absolute: file });
			} else {
				skipped++;
				onEntry?.({ relative: rel, action, absolute: file });
			}
		}
		count++;
		if (progress) {
			const pct = Math.floor((count / total) * 100);
			progress(pct);
			await sleep(10); // give some time for the progress bar to render
		}
	}
	zip.end();
	await writeDone;
	if (progress) {
		progress(100);
		await sleep(100); // give some time for the progress bar to render
	}
	return { added, skipped, outputPath: outdir };
}
