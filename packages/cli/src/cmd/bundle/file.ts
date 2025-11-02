import { resolve } from 'node:path';

export async function getFilesRecursively(dir: string): Promise<string[]> {
	const glob = new Bun.Glob('**/*');
	const files: string[] = [];
	for await (const file of glob.scan({ cwd: dir, onlyFiles: true, absolute: false })) {
		files.push(resolve(dir, file));
	}
	return files;
}
