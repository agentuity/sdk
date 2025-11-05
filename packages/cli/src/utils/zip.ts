import { relative } from 'node:path';
import { Glob } from 'bun';
import AdmZip from 'adm-zip';

interface Options {
	progress?: (val: number) => void;
	filter?: (filename: string, relative: string) => boolean;
}

export async function zipDir(dir: string, outdir: string, options?: Options) {
	const zip = new AdmZip();
	const files = await Array.fromAsync(new Glob('**').scan({ cwd: dir, absolute: true }));
	const total = files.length;
	let count = 0;
	for (const file of files) {
		const rel = relative(dir, file);
		let skip = false;
		if (options?.filter) {
			if (!options.filter(file, rel)) {
				skip = true;
			}
		}
		if (!skip) {
			zip.addLocalFile(file, undefined, rel);
		}
		count++;
		if (options?.progress) {
			const progress = Math.floor((count / total) * 100);
			options.progress(progress);
			await Bun.sleep(10); // give some time for the progress bar to render
		}
	}
	await zip.writeZip(outdir);
	if (options?.progress) {
		options.progress(100);
		await Bun.sleep(100); // give some time for the progress bar to render
	}
}
