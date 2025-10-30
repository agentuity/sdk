import { join, resolve } from 'node:path';
import { cpSync, existsSync, rmSync } from 'node:fs';
import AgentuityBundler from './plugin';
import { getFilesRecursively } from './file';
import { getVersion } from '../../version';

export interface BundleOptions {
	rootDir: string;
	dev?: boolean;
	env?: Map<string, string>;
}

export async function bundle({ dev = false, rootDir }: BundleOptions) {
	const appFile = join(rootDir, 'app.ts');
	if (!existsSync(appFile)) {
		throw new Error(`App file not found at expected location: ${appFile}`);
	}
	const outDir = join(rootDir, '.agentuity');
	const srcDir = join(rootDir, 'src');

	const appEntrypoints: string[] = [];

	for (const folder of ['apis', 'agents']) {
		const dir = join(srcDir, folder);
		if (!existsSync(dir)) {
			if (folder === 'agents') {
				throw new Error(`Expected directory not found: ${dir}`);
			}
			continue;
		}
		const files = await getFilesRecursively(dir);
		for (const filename of files) {
			if (/\.[jt]s?$/.test(filename)) {
				appEntrypoints.push(filename);
			}
		}
	}
	appEntrypoints.push(appFile);

	const webDir = join(srcDir, 'web');

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

	await (async () => {
		const config: Bun.BuildConfig = {
			entrypoints: appEntrypoints,
			root: rootDir,
			outdir: outDir,
			define,
			sourcemap: dev ? 'inline' : 'external',
			env: 'disable',
			plugins: [AgentuityBundler],
			target: 'bun',
			format: 'esm',
			banner: `// Generated file. DO NOT EDIT`,
			minify: isProd,
			drop: isProd ? ['debugger'] : undefined,
			conditions: [isProd ? 'production' : 'development', 'bun'],
		};
		try {
			await Bun.build(config);
		} catch (ex) {
			console.error(ex);
			process.exit(1);
		}
	})();

	await (async () => {
		// Find workspace root for monorepo support
		let workspaceRoot = rootDir;
		let currentDir = rootDir;
		while (true) {
			const pkgPath = join(currentDir, 'package.json');
			if (existsSync(pkgPath)) {
				const pkg = JSON.parse(await Bun.file(pkgPath).text());
				if (pkg.workspaces) {
					workspaceRoot = currentDir;
					break;
				}
			}
			const parent = resolve(currentDir, '..');
			if (parent === currentDir) break; // reached filesystem root
			currentDir = parent;
		}

		// Make webEntrypoints - just the HTML files themselves
		const webEntrypoints = [...new Bun.Glob('**.html').scanSync(webDir)].map((htmlFile) =>
			resolve(webDir, htmlFile)
		);

		const config: Bun.BuildConfig = {
			entrypoints: webEntrypoints,
			root: webDir,
			outdir: join(outDir, 'web'),
			define,
			sourcemap: dev ? 'inline' : 'linked',
			env: 'AGENTUITY_PUBLIC_*',
			plugins: [AgentuityBundler],
			target: 'browser',
			format: 'cjs',
			banner: `// Generated file. DO NOT EDIT`,
			minify: isProd,
			drop: isProd ? ['debugger'] : undefined,
			naming: {
				entry: '[name].js',
				chunk: 'chunk/[name]-[hash].js',
				asset: 'asset/[name]-[hash].[ext]',
			},
			packages: 'bundle',
			external: workspaceRoot !== rootDir ? [] : undefined,
		};
		try {
			await Bun.build(config);
		} catch (ex) {
			console.error(ex);
			process.exit(1);
		}
	})();

	const webPublicDir = join(webDir, 'public');
	if (existsSync(webPublicDir)) {
		const webOutPublicDir = join(outDir, 'web', 'public');
		cpSync(webPublicDir, webOutPublicDir, { recursive: true });
	}

	await Bun.write(
		`${outDir}/package.json`,
		JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
	);
}
