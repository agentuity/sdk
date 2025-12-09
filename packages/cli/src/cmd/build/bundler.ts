import { $, semver } from 'bun';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import gitParseUrl from 'git-url-parse';
import { StructuredError } from '@agentuity/core';
import * as tui from '../../tui';
import { pauseStepUI } from '../../steps';
import AgentuityBundler, { getBuildMetadata } from './plugin';
import { getFilesRecursively } from './file';
import { getVersion } from '../../version';
import type { Project } from '../../types';
import { fixDuplicateExportsInDirectory } from './fix-duplicate-exports';
import type { Logger } from '../../types';
import { generateWorkbenchMainTsx, generateWorkbenchIndexHtml } from './workbench';
import { analyzeWorkbench, type WorkbenchAnalysis } from './ast';
import { type DeployOptions } from '../../schemas/deploy';

const minBunVersion = '>=1.3.3';

async function checkBunVersion(): Promise<string[]> {
	if (semver.satisfies(Bun.version, minBunVersion)) {
		return []; // Version is OK, no output needed
	}

	const message = `Bun is using version ${Bun.version}. This project requires Bun version ${minBunVersion} to build.`;

	if (process.stdin.isTTY && process.stdout.isTTY) {
		// Pause the step UI for interactive prompt
		const resume = pauseStepUI();

		tui.warning(message);
		const ok = await tui.confirm('Would you like to upgrade now?');

		// Small delay to ensure console.log('') in confirm completes
		await new Promise((resolve) => setTimeout(resolve, 10));

		resume(); // Resume step UI

		if (ok) {
			await $`bun upgrade`.quiet();
			const version = (await $`bun -v`.quiet().text()).trim();
			// Return success message to show in output box
			return [tui.colorSuccess(`Upgraded Bun to ${version}`)];
		}
	}

	// Failed to upgrade or user declined
	throw new InvalidBunVersion({
		current: Bun.version,
		required: minBunVersion,
		message,
	});
}

export interface BundleOptions extends DeployOptions {
	rootDir: string;
	dev?: boolean;
	env?: Map<string, string>;
	orgId?: string;
	projectId?: string;
	deploymentId?: string;
	project?: Project;
	port?: number;
	outDir?: string;
	region: string;
	logger: Logger;
	workbench?: WorkbenchAnalysis;
}

type BuildResult = Awaited<ReturnType<typeof Bun.build>>;
type BuildLogs = BuildResult['logs'];

const AppFileNotFoundError = StructuredError('AppFileNotFoundError');
const AgentsDirNotFoundError = StructuredError('AgentsDirNotFoundError');
const BuildFailedError = StructuredError('BuildFailedError')<{ logs?: BuildLogs }>();
const InvalidBunVersion = StructuredError('InvalidBunVersion')<{
	current: string;
	required: string;
}>();

const handleBuildFailure = (buildResult: BuildResult) => {
	// Collect all build errors with full details
	const errorMessages = buildResult.logs
		.map((log) => {
			const parts = [log.message];
			if (log.position) {
				parts.push(`  at ${log.position.file}:${log.position.line}:${log.position.column}`);
			}
			return parts.join('\n');
		})
		.join('\n');
	throw new BuildFailedError({
		message: errorMessages || 'Build failed with no error messages',
		logs: buildResult.logs,
	});
};

export async function bundle({
	orgId,
	projectId,
	deploymentId,
	dev = false,
	rootDir,
	project,
	port,
	outDir: customOutDir,
	tag,
	logsUrl,
	commitUrl,
	provider,
	trigger,
	event,
	pullRequestNumber,
	pullRequestCommentId,
	pullRequestURL,
	message,
	env,
	region,
	logger,
	workbench,
}: BundleOptions): Promise<{ output: string[] }> {
	const output: string[] = [];

	const appFile = join(rootDir, 'app.ts');
	if (!existsSync(appFile)) {
		throw new AppFileNotFoundError({
			message: `App file not found at expected location: ${appFile}`,
		});
	}

	const versionOutput = await checkBunVersion();
	output.push(...versionOutput);

	const outDir = customOutDir ?? join(rootDir, '.agentuity');
	const srcDir = join(rootDir, 'src');

	const appEntrypoints: string[] = [];

	for (const folder of ['web', 'agent']) {
		const dir = join(srcDir, folder);
		if (!existsSync(dir)) {
			if (folder === 'agent') {
				throw new AgentsDirNotFoundError({ message: `Expected directory not found: ${dir}` });
			}
			continue;
		}
		const files = await getFilesRecursively(dir);
		for (const filename of files) {
			if (
				/\.[jt]s?$/.test(filename) &&
				!filename.includes('.generated.') &&
				basename(filename) !== 'AGENTS.md'
			) {
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

	// Pre-create all nested source directories in output
	// This is needed because Bun.build with naming.entry preserves structure
	// but doesn't create nested directories automatically
	for (const entrypoint of appEntrypoints) {
		const relPath = relative(rootDir, dirname(entrypoint));
		const outputSubdir = join(outDir, relPath);
		mkdirSync(outputSubdir, { recursive: true });
	}

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

	if (env) {
		for (const [key, value] of env) {
			define[`process.env.${key}`] = JSON.stringify(value);
		}
	}

	// Common externals for native modules (same as legacy CLI)
	const commonExternals = ['bun', 'fsevents', 'chromium-bidi', 'sharp'];

	// Allow projects to specify custom externals via package.json "externals" field
	const customExternals: string[] = [];
	if (pkgContents.externals && Array.isArray(pkgContents.externals)) {
		customExternals.push(...pkgContents.externals.filter((e: unknown) => typeof e === 'string'));
	}

	const externalPatterns = [...commonExternals, ...customExternals];

	// For production builds: install externals FIRST, then discover full dependency tree
	// This prevents bundling dependencies that will be in node_modules anyway
	let external = externalPatterns;
	if (!dev) {
		logger.debug('Installing externalized packages to discover full dependency tree...');

		// Step 1: Collect packages matching external patterns
		const externalInstalls: string[] = [];
		for (const pattern of externalPatterns) {
			if (pattern.endsWith('/*')) {
				const prefix = pattern.slice(0, -2);
				const nmDir = join(rootDir, 'node_modules', prefix);
				if (existsSync(nmDir)) {
					const entries = readdirSync(nmDir);
					for (const entry of entries) {
						const pkgName = `${prefix}/${entry}`;
						if (existsSync(join(rootDir, 'node_modules', pkgName))) {
							externalInstalls.push(pkgName);
						}
					}
				}
			} else {
				if (existsSync(join(rootDir, 'node_modules', pattern))) {
					externalInstalls.push(pattern);
				}
			}
		}

		// Step 2: Write minimal package.json and install externals
		if (externalInstalls.length > 0) {
			await Bun.write(
				`${outDir}/package.json`,
				JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
			);

			logger.debug(
				'Installing %d packages: %s',
				externalInstalls.length,
				externalInstalls.join(', ')
			);
			await $`bun install --no-save --ignore-scripts --target=bun-linux-x64 ${externalInstalls}`
				.cwd(outDir)
				.quiet();

			// Step 3: Scan what actually got installed (includes transitive dependencies)
			const installedNmDir = join(outDir, 'node_modules');
			if (existsSync(installedNmDir)) {
				const allInstalled: string[] = [];

				// Recursively find all installed packages
				const scanDir = (dir: string, prefix = '') => {
					const entries = readdirSync(dir, { withFileTypes: true });
					for (const entry of entries) {
						if (entry.isDirectory()) {
							const pkgName = prefix ? `${prefix}/${entry.name}` : entry.name;

							// Check if this is a package (has package.json)
							if (existsSync(join(dir, entry.name, 'package.json'))) {
								allInstalled.push(pkgName);
							}

							// Recurse into scoped packages (@org/package)
							if (entry.name.startsWith('@')) {
								scanDir(join(dir, entry.name), entry.name);
							}
						}
					}
				};

				scanDir(installedNmDir);
				logger.debug(
					'Discovered %d total packages (including dependencies)',
					allInstalled.length
				);

				// Step 4: Use ALL installed packages as externals for bundling
				external = allInstalled;
			}
		}
	}

	const tsconfigPath = join(rootDir, 'tsconfig.json');
	const hasTsconfig = existsSync(tsconfigPath);

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
			minify: !dev,
			drop: isProd ? ['debugger'] : undefined,
			// Disable splitting - causes module initialization issues with externalized packages
			// The chunk helper functions (__commonJS, __esm, etc.) don't properly handle
			// CommonJS packages in node_modules that require() other modules
			splitting: false,
			conditions: [isProd ? 'production' : 'development', 'bun'],
			external,
			naming: {
				entry: '[dir]/[name].[ext]',
				chunk: 'chunk/[name]-[hash].[ext]',
				asset: 'asset/[name]-[hash].[ext]',
			},
			tsconfig: hasTsconfig ? tsconfigPath : undefined,
		};
		const buildResult = await Bun.build(config);
		if (!buildResult.success) {
			handleBuildFailure(buildResult);
		}
	})();

	const buildmetadata = getBuildMetadata();
	buildmetadata.assets = [];
	buildmetadata.project = {
		id: projectId ?? '',
		name: pkgContents.name,
		version: pkgContents.version,
		description: pkgContents.description,
		keywords: pkgContents.keywords,
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

	// Analyze workbench config early to set environment variables for web build
	if (existsSync(appFile)) {
		if (!workbench) {
			const appContent = await Bun.file(appFile).text();
			workbench = analyzeWorkbench(appContent);
		}

		if (workbench.hasWorkbench) {
			// Create workbench config with proper defaults
			const defaultConfig = { route: '/workbench', headers: {}, port: port || 3500 };
			const config = { ...defaultConfig, ...workbench.config };

			// Add to define so process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH gets replaced at build time
			define['process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH'] = JSON.stringify(config.route);
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
				const webOutDir = join(outDir, 'web');
				mkdirSync(webOutDir, { recursive: true });
				mkdirSync(join(webOutDir, 'chunk'), { recursive: true });
				mkdirSync(join(webOutDir, 'asset'), { recursive: true });
				const isLocalRegion = region === 'local' || region === 'l';

				const config: Bun.BuildConfig = {
					entrypoints: webEntrypoints,
					root: webDir,
					outdir: webOutDir,
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
					// Ensure React is resolved from the consuming app's node_modules
					conditions: ['browser', 'import', 'default'],
					publicPath:
						isProd && deploymentId && !isLocalRegion
							? `https://static.agentuity.com/${deploymentId}/`
							: undefined,
					naming: {
						entry: '[dir]/[name].[ext]',
						chunk: 'web/chunk/[name]-[hash].[ext]',
						asset: 'web/asset/[name]-[hash].[ext]',
					},
					tsconfig: hasTsconfig ? tsconfigPath : undefined,
				};
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
					handleBuildFailure(result);
				}
			}
		})();
	}

	// Bundle workbench app if detected via setupWorkbench
	if (existsSync(appFile) && workbench && workbench.hasWorkbench) {
		// Create workbench config with proper defaults
		const defaultConfig = { route: '/workbench', headers: {}, port: port || 3500 };
		const config = { ...defaultConfig, ...workbench.config };
		try {
			// Generate workbench files on the fly instead of using files from package
			const tempWorkbenchDir = join(outDir, 'temp-workbench');
			mkdirSync(tempWorkbenchDir, { recursive: true });

			// Generate files using templates
			await Bun.write(join(tempWorkbenchDir, 'main.tsx'), generateWorkbenchMainTsx(config));
			const workbenchIndexFile = join(tempWorkbenchDir, 'index.html');
			await Bun.write(workbenchIndexFile, generateWorkbenchIndexHtml());

			// Bundle workbench using generated files
			// Disable splitting to avoid CommonJS/ESM module resolution conflicts
			const workbenchBuildConfig: Bun.BuildConfig = {
				entrypoints: [workbenchIndexFile],
				outdir: join(outDir, 'workbench'),
				sourcemap: dev ? 'inline' : 'linked',
				target: 'browser',
				format: 'esm',
				banner: `// Generated file. DO NOT EDIT`,
				minify: !dev,
				drop: isProd ? ['debugger'] : undefined,
				splitting: false,
				packages: 'bundle',
				conditions: ['browser', 'import', 'default'],
				naming: {
					entry: '[dir]/[name].[ext]',
					chunk: 'workbench/chunk/[name]-[hash].[ext]',
					asset: 'workbench/asset/[name]-[hash].[ext]',
				},
			};

			const workbenchResult = await Bun.build(workbenchBuildConfig);
			if (workbenchResult.success) {
				logger.debug('Workbench bundled successfully');
				// Clean up temp directory
				rmSync(tempWorkbenchDir, { recursive: true, force: true });
			} else {
				logger.error('Workbench bundling failed. Logs:', workbenchResult.logs);
				if (workbenchResult.logs.length === 0) {
					logger.error('No build logs available. Checking generated files...');
					logger.error('Temp dir exists:', await Bun.file(tempWorkbenchDir).exists());
					logger.error('Index file exists:', await Bun.file(workbenchIndexFile).exists());
					logger.error(
						'Main.tsx exists:',
						await Bun.file(join(tempWorkbenchDir, 'main.tsx')).exists()
					);
				}
				// Clean up temp directory even on failure
				rmSync(tempWorkbenchDir, { recursive: true, force: true });
				logger.fatal('Workbench bundling failed');
			}
		} catch (error) {
			logger.error('Failed to bundle workbench:', error);
			// Collect all error messages
			const errorMessages: string[] = [];
			if (error instanceof AggregateError && Array.isArray(error.errors)) {
				for (const err of error.errors) {
					// Extract useful info from Bun's ResolveMessage errors
					if (err && typeof err === 'object') {
						const errObj = err as Record<string, unknown>;
						if (typeof errObj.message === 'string') {
							errorMessages.push(`  ${errObj.message}`);
						}
						const position = errObj.position as Record<string, unknown> | undefined;
						if (position?.file && position?.line && position?.column) {
							errorMessages.push(
								`  at ${position.file}:${position.line}:${position.column}`
							);
						}
					}
				}
			}

			// Show different tips based on whether we're in a monorepo or published package
			const isMonorepo = await Bun.file(join(rootDir, '../../packages')).exists();
			if (isMonorepo) {
				errorMessages.push(
					'\nTip: Make sure all @agentuity/* packages are built by',
					'running "bun run build" from the monorepo root.'
				);
			} else {
				errorMessages.push(
					'\nTip: If you see module resolution errors, try running',
					'"bun install" to ensure all dependencies are installed.'
				);
			}

			// Don't continue if workbench bundling fails
			logger.fatal(errorMessages.join('\n'));
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
			provider: 'git',
		};
		if (process.env.GITHUB_REPOSITORY) {
			buildmetadata.deployment.git.provider = 'github';
		}
		if (process.env.CI && !trigger) {
			buildmetadata.deployment.git.trigger = 'ci';
		}
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
				let branch = process.env.GITHUB_HEAD_REF;
				if (!branch) {
					const branchText = $`git branch --show-current`.nothrow().quiet();
					if (branchText) {
						branch = await branchText.text();
					}
				}
				if (branch) {
					buildmetadata.deployment.git.branch = branch.trim();
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

	// if in gitlab CI, set defaults before user overrides
	if (process.env.GITLAB_CI && buildmetadata?.deployment) {
		buildmetadata.deployment.git ??= {};
		buildmetadata.deployment.git.provider ??= 'gitlab';
		buildmetadata.deployment.git.branch ??= process.env.CI_COMMIT_REF_NAME;
		buildmetadata.deployment.git.commit ??= process.env.CI_COMMIT_SHA;
		buildmetadata.deployment.git.buildUrl ??=
			process.env.CI_JOB_URL ?? process.env.CI_PIPELINE_URL;
	}

	// configure any overrides or any that aren't detected automatically
	if (buildmetadata?.deployment) {
		buildmetadata.deployment.git ??= {};

		// build tags: start with existing discovered tags, add defaults, then merge explicit tags
		const tags = new Set(buildmetadata.deployment.git.tags ?? []);
		tags.add('latest');
		if (buildmetadata.deployment.git.branch) {
			tags.add(buildmetadata.deployment.git.branch);
		}
		if (buildmetadata.deployment.git.commit) {
			tags.add(buildmetadata.deployment.git.commit.substring(0, 7));
		}
		if (tag?.length && !(tag.length === 1 && tag[0] === 'latest')) {
			for (const t of tag) {
				tags.add(t);
			}
			tags.delete('latest'); // if you specify explicit tags we remove latest
		}
		buildmetadata.deployment.git.tags = Array.from(tags);

		if (provider) {
			buildmetadata.deployment.git.provider = provider;
		}
		if (logsUrl) {
			buildmetadata.deployment.git.buildUrl = logsUrl;
		}
		if (commitUrl) {
			buildmetadata.deployment.git.url = commitUrl;
		}
		if (trigger) {
			buildmetadata.deployment.git.trigger = trigger;
		}
		if (event) {
			buildmetadata.deployment.git.event = event;
		}
		if (pullRequestNumber) {
			buildmetadata.deployment.git.pull_request = {
				number: pullRequestNumber,
				url: pullRequestURL,
				commentId: pullRequestCommentId,
			};
		}
		if (message) {
			buildmetadata.deployment.git.message = message;
		}
	}

	// Write minimal package.json for dev mode (production already wrote it above)
	if (dev) {
		await Bun.write(
			`${outDir}/package.json`,
			JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
		);
	}

	await Bun.write(
		`${outDir}/agentuity.metadata.json`,
		dev ? JSON.stringify(buildmetadata, null, 2) : JSON.stringify(buildmetadata)
	);

	// Generate route mapping file for runtime route tracking
	const routeMapping: Record<string, string> = {};
	for (const route of buildmetadata.routes ?? []) {
		routeMapping[`${route.method} ${route.path}`] = route.id;
	}
	await Bun.write(
		`${outDir}/.routemapping.json`,
		dev ? JSON.stringify(routeMapping, null, 2) : JSON.stringify(routeMapping)
	);

	return { output };
}
