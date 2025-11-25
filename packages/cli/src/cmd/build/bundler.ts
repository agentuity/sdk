import { $ } from 'bun';
import { join, relative, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import gitParseUrl from 'git-url-parse';
import AgentuityBundler, { getBuildMetadata } from './plugin';
import { getFilesRecursively } from './file';
import { getVersion } from '../../version';
import type { Project } from '../../types';
import { fixDuplicateExportsInDirectory } from './fix-duplicate-exports';
import { createLogger } from '@agentuity/server';
import type { LogLevel } from '../../types';

export interface BundleOptions {
	rootDir: string;
	dev?: boolean;
	env?: Map<string, string>;
	orgId?: string;
	projectId?: string;
	deploymentId?: string;
	project?: Project;
	port?: number;
}

export async function bundle({
	orgId,
	projectId,
	deploymentId,
	dev = false,
	rootDir,
	project,
	port,
}: BundleOptions) {
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

	if (existsSync(outDir)) {
		rmSync(outDir, { recursive: true, force: true });
	}
	// Ensure output directory and subdirectories exist before building
	mkdirSync(outDir, { recursive: true });
	mkdirSync(join(outDir, 'chunk'), { recursive: true });
	mkdirSync(join(outDir, 'asset'), { recursive: true });

	const pkgFile = Bun.file(join(rootDir, 'package.json'));
	const pkgContents = JSON.parse(await pkgFile.text());
	const isProd = !dev;

	const define: Record<string, string> = {
		'process.env.AGENTUITY_CLOUD_SDK_VERSION': JSON.stringify(getVersion() ?? '1.0.0'),
		'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
	};

	if (orgId) {
		define['process.env.AGENTUITY_CLOUD_ORG_ID'] = JSON.stringify(orgId);
	}
	if (projectId) {
		define['process.env.AGENTUITY_CLOUD_PROJECT_ID'] = JSON.stringify(projectId);
	}
	if (deploymentId) {
		define['process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID'] = JSON.stringify(deploymentId);
	}

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
			// Disable minify for server bundle (keep code readable for debugging)
			// Enable splitting to reduce bundle size by extracting common code
			minify: false,
			drop: isProd ? ['debugger'] : undefined,
			splitting: true,
			conditions: [isProd ? 'production' : 'development', 'bun'],
			naming: {
				entry: '[dir]/[name].[ext]',
				chunk: 'chunk/[name]-[hash].[ext]',
				asset: 'asset/[name]-[hash].[ext]',
			},
		};
		try {
			await Bun.build(config);
			// Fix duplicate exports caused by Bun splitting bug
			// See: https://github.com/oven-sh/bun/issues/5344
			await fixDuplicateExportsInDirectory(outDir, false);
		} catch (ex) {
			console.error(ex);
			process.exit(1);
		}
	})();

	const buildmetadata = getBuildMetadata();
	buildmetadata.assets = [];
	buildmetadata.project = {
		id: projectId ?? '',
		name: pkgContents.name,
		version: pkgContents.version,
		orgId: orgId ?? '',
	};
	buildmetadata.deployment = {
		...(project?.deployment ?? {}),
		build: {
			bun: Bun.version,
			agentuity: '',
			arch: process.arch,
			platform: process.platform,
		},
		date: new Date().toUTCString(),
		id: deploymentId ?? '',
	};
	if (!dev) {
		// try local first
		const agNMPackage = join(rootDir, 'node_modules', '@agentuity', 'cli', 'package.json');
		if (existsSync(agNMPackage)) {
			try {
				const npmpkg = await Bun.file(agNMPackage).json();
				if (npmpkg.version) {
					buildmetadata.deployment.build.agentuity = npmpkg.version;
				}
			} catch {
				// Ignore malformed package.json
			}
		} else {
			try {
				// now try the global
				const r = $`bunx @agentuity/cli version`.quiet().nothrow();
				if (r) {
					const version = await r.text();
					if (version) {
						buildmetadata.deployment.build.agentuity = version.trim();
					}
				}
			} catch {
				// ignore error from bunx
			}
		}
	}

	// web folder is optional
	const webDir = join(srcDir, 'web');
	if (existsSync(webDir)) {
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

			if (webEntrypoints.length) {
				const config: Bun.BuildConfig = {
					entrypoints: webEntrypoints,
					root: webDir,
					outdir: join(outDir, 'web'),
					define,
					sourcemap: dev ? 'inline' : 'linked',
					env: 'AGENTUITY_PUBLIC_*',
					plugins: [AgentuityBundler],
					target: 'browser',
					format: 'esm',
					banner: `// Generated file. DO NOT EDIT`,
					minify: true,
					drop: isProd ? ['debugger'] : undefined,
					splitting: true,
					packages: 'bundle',
					external: workspaceRoot !== rootDir ? [] : undefined,
					publicPath:
						isProd && deploymentId
							? `https://static.agentuity.com/${deploymentId}/`
							: undefined,
					naming: {
						entry: '[dir]/[name].[ext]',
						chunk: 'web/chunk/[name]-[hash].[ext]',
						asset: 'web/asset/[name]-[hash].[ext]',
					},
				};
				try {
					const result = await Bun.build(config);
					if (result.success) {
						// Fix duplicate exports caused by Bun splitting bug
						// See: https://github.com/oven-sh/bun/issues/5344
						await fixDuplicateExportsInDirectory(join(outDir, 'web'), false);

						if (!dev && buildmetadata?.assets) {
							const assets = buildmetadata.assets;
							result.outputs
								// Filter for deployable assets: sourcemaps (hash '00000000') and content-addressed files
								.filter((x) => x.hash === '00000000' || (x.hash && x.path.includes(x.hash)))
								.forEach((artifact) => {
									const r = relative(join(outDir, 'web'), artifact.path);
									assets.push({
										filename: r,
										kind: artifact.kind,
										contentType: artifact.type,
										size: artifact.size,
									});
								});
						}
					} else {
						console.error(result.logs.join('\n'));
						process.exit(1);
					}
				} catch (ex) {
					console.error(ex);
					process.exit(1);
				}
			}
		})();
	}

	// Bundle workbench app if detected via setupWorkbench
	const { analyzeWorkbench } = await import('./ast');
	if (existsSync(appFile)) {
		const appContent = await Bun.file(appFile).text();
		const analysis = await analyzeWorkbench(appContent);

		if (analysis.hasWorkbench) {
			// Encode workbench config for environment variable
			const { encodeWorkbenchConfig } = await import('@agentuity/core');
			const config = analysis.config || { route: '/workbench', headers: {} };
			// Add port to config (defaults to 3500 if not provided)
			const configWithPort = { ...config, port: port || 3500 };
			const encodedConfig = encodeWorkbenchConfig(configWithPort);
			const workbenchDefine = {
				...define,
				AGENTUITY_WORKBENCH_CONFIG_INLINE: JSON.stringify(encodedConfig),
			};
			const logger = createLogger((process.env.AGENTUITY_LOG_LEVEL as LogLevel) || 'info');
			try {
				const projectRequire = createRequire(resolve(rootDir, 'package.json'));
				const workbenchPkgPath = projectRequire.resolve('@agentuity/workbench/package.json');
				const workbenchAppDir = join(dirname(workbenchPkgPath), 'src', 'app');

				if (existsSync(workbenchAppDir)) {
					const workbenchIndexFile = join(workbenchAppDir, 'index.html');
					if (existsSync(workbenchIndexFile)) {
						// Bundle workbench using same config as main web app
						const workbenchBuildConfig: Bun.BuildConfig = {
							entrypoints: [workbenchIndexFile],
							root: workbenchAppDir,
							outdir: join(outDir, 'workbench'),
							define: workbenchDefine,
							sourcemap: dev ? 'inline' : 'linked',
							plugins: [AgentuityBundler],
							target: 'browser',
							format: 'esm',
							banner: `// Generated file. DO NOT EDIT`,
							minify: true,
							splitting: true,
							packages: 'bundle',
							naming: {
								entry: '[dir]/[name].[ext]',
								chunk: 'workbench/chunk/[name]-[hash].[ext]',
								asset: 'workbench/asset/[name]-[hash].[ext]',
							},
						};

						const workbenchResult = await Bun.build(workbenchBuildConfig);
						if (workbenchResult.success) {
							logger.debug('Workbench bundled successfully');
						} else {
							logger.error('Workbench bundling failed:', workbenchResult.logs.join('\n'));
						}
					}
				}
			} catch (error) {
				logger.error('Failed to bundle workbench:', error);
			}
		}
	}

	if (!dev && buildmetadata) {
		const webPublicDir = join(webDir, 'public');
		if (existsSync(webPublicDir)) {
			const assets = buildmetadata.assets;
			const webOutPublicDir = join(outDir, 'web', 'public');
			cpSync(webPublicDir, webOutPublicDir, { recursive: true });
			[...new Bun.Glob('**.*').scanSync(webOutPublicDir)].forEach((f) => {
				const bf = Bun.file(join(webOutPublicDir, f));
				assets.push({
					filename: join('public', f),
					kind: 'static',
					contentType: bf.type,
					size: bf.size,
				});
			});
		}
	}

	if (!dev && Bun.which('git') && buildmetadata?.deployment) {
		buildmetadata.deployment.git = {
			commit: process.env.GIT_SHA || process.env.GITHUB_SHA,
			branch: process.env.GITHUB_REF ? process.env.GITHUB_REF.replace('refs/heads/', '') : '',
			repo: process.env.GITHUB_REPOSITORY
				? gitParseUrl(process.env.GITHUB_REPOSITORY).toString('https')
				: '',
		};
		// pull out the git information if we have it
		try {
			let gitDir = join(rootDir, '.git');
			let parentDir = dirname(dirname(gitDir));
			while (!existsSync(gitDir) && parentDir !== dirname(parentDir) && gitDir !== '/') {
				gitDir = join(parentDir, '.git');
				parentDir = dirname(parentDir);
			}
			if (existsSync(gitDir)) {
				const tag = $`git tag -l --points-at HEAD`.nothrow().quiet();
				if (tag) {
					const tags = await tag.text();
					buildmetadata.deployment.git.tags = tags
						.trim()
						.split(/\n/)
						.map((s) => s.trim())
						.filter(Boolean);
				}
				const branch = $`git branch --show-current`.nothrow().quiet();
				if (branch) {
					const _branch = await branch.text();
					if (_branch) {
						buildmetadata.deployment.git.branch = _branch.trim();
					}
				}
				const commit = $`git rev-parse HEAD`.nothrow().quiet();
				if (commit) {
					const sha = await commit.text();
					if (sha) {
						buildmetadata.deployment.git.commit = sha.trim();
						const msg = $`git log --pretty=format:%s -n1 ${buildmetadata.deployment.git.commit}`;
						if (msg) {
							const _msg = await msg.text();
							if (_msg) {
								buildmetadata.deployment.git.message = _msg.trim();
							}
						}
						const origin = $`git config --get remote.origin.url`.nothrow().quiet();
						if (origin) {
							const _origin = await origin.text();
							if (_origin) {
								const _url = gitParseUrl(_origin.trim());
								buildmetadata.deployment.git.repo = _url.toString('https');
							}
						}
					}
				}
			}
		} catch {
			// ignore errors
		}
	}

	await Bun.write(
		`${outDir}/package.json`,
		JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
	);

	await Bun.write(
		`${outDir}/agentuity.metadata.json`,
		dev ? JSON.stringify(buildmetadata, null, 2) : JSON.stringify(buildmetadata)
	);
}
