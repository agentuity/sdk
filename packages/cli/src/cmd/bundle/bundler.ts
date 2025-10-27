import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import AgentuityBuilder from './plugin';
import { getFilesRecursively } from './file';
import { getVersion } from '../../version';

export interface BundleOptions {
	rootDir: string;
	dev?: boolean;
}

export async function bundle({ dev = false, rootDir }: BundleOptions) {
	const appFile = join(rootDir, 'app.ts');
	const f = Bun.file(appFile);
	if (!(await f.exists())) {
		throw new Error(`App file not found at expected location: ${appFile}`);
	}
	const outDir = join(rootDir, '.agentuity');
	const srcDir = join(rootDir, 'src');

	const entrypoints: string[] = [];

	for (const folder of ['apis', 'agents', 'web']) {
		const dir = join(srcDir, folder);
		if (!existsSync(dir)) {
			if (folder === 'agents') {
				throw new Error(`Expected directory not found: ${dir}`);
			}
			continue;
		}
		const files = await getFilesRecursively(dir);
		for (const filename of files) {
			if (/\.[jt]sx?$/.test(filename)) {
				entrypoints.push(filename);
			}
		}
	}

	entrypoints.push(appFile);

	if (existsSync(outDir)) {
		rmSync(outDir, { recursive: true, force: true });
	}

	const pkgFile = Bun.file('./package.json');
	const pkgContents = JSON.parse(await pkgFile.text());

	const isProd = !dev;

	const define = {
		'process.env.AGENTUITY_CLOUD_SDK_VERSION': JSON.stringify(getVersion() ?? '1.0.0'),
		'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
	};

	const config: Bun.BuildConfig = {
		entrypoints,
		root: rootDir,
		outdir: outDir,
		define,
		sourcemap: dev ? 'inline' : 'external',
		env: 'AGENTUITY_CLOUD_*',
		plugins: [AgentuityBuilder],
		target: 'bun',
		format: 'esm',
		banner: `// Generated file. DO NOT EDIT`,
		minify: isProd,
		drop: isProd ? ['debugger'] : undefined,
		naming: isProd
			? {
					entry: '[dir]/[name].js',
					chunk: 'chunks/[name]-[hash].js',
					asset: 'assets/[name]-[hash].[ext]',
				}
			: undefined,
		conditions: [isProd ? 'production' : 'development', 'bun'],
	};

	await Bun.write(
		`${outDir}/package.json`,
		JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
	);

	const agentuityYAML = Bun.file('./agentuity.yaml');
	if (await agentuityYAML.exists()) {
		await Bun.write(`${outDir}/agentuity.yaml`, agentuityYAML);
	}

	await Bun.build(config);
}
