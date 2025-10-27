import fs from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const readdir = promisify(fs.readdir);

export async function getFilesRecursively(dir: string): Promise<string[]> {
	const subdirs = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		subdirs.map(async (dirent: fs.Dirent) => {
			const res = resolve(dir, dirent.name);
			return dirent.isDirectory() ? getFilesRecursively(res) : res;
		})
	);
	return files.flat();
}
