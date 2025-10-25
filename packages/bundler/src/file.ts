import fs from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const readdir = promisify(fs.readdir);

export async function getFilesRecursively(dir: string): Promise<string[]> {
	const subdirs = await readdir(dir, { withFileTypes: true }); // Get directory entries with file type info
	const files = await Promise.all(
		subdirs.map(async (dirent: fs.Dirent) => {
			const res = resolve(dir, dirent.name); // Resolve full path
			return dirent.isDirectory() ? getFilesRecursively(res) : res; // Recurse if directory, return path if file
		})
	);
	return files.flat(); // Flatten the array of arrays into a single array of file paths
}
