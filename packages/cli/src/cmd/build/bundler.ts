import { $ } from 'bun';
import { z } from 'zod';
import { join, relative, resolve, dirname } from 'node:path';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import gitParseUrl from 'git-url-parse';
import AgentuityBundler, { getBuildMetadata } from './plugin';
import { getFilesRecursively } from './file';
import { getVersion } from '../../version';
import type { Project } from '../../types';
import { fixDuplicateExportsInDirectory } from './fix-duplicate-exports';
import { createLogger } from '@agentuity/server';
import type { LogLevel } from '../../types';
import { generateWorkbenchMainTsx, generateWorkbenchIndexHtml } from './workbench-templates';
import { analyzeWorkbench } from './ast';
import { encodeWorkbenchConfig } from '@agentuity/core';

export const DeployOptionsSchema = z.object({
	tag: z
		.array(z.string())
		.default(['latest'])
		.optional()
		.describe('One or more tags to add to the deployment'),
	logsUrl: z.url().optional().describe('The url to the CI build logs'),
	trigger: z
		.enum(['cli', 'workflow', 'webhook'])
		.default('cli')
		.optional()
		.describe('The trigger that caused the build'),
	commitUrl: z.url().optional().describe('The url to the CI commit'),
	message: z.string().optional().describe('The message to associate with this deployment'),
	provider: z.string().optional().describe('The CI provider name (attempts to autodetect)'),
	event: z
		.enum(['pull_request', 'push', 'manual', 'workflow'])
		.default('manual')
		.optional()
		.describe('The event that triggered the deployment'),
	pullRequestNumber: z.number().optional().describe('the pull request number'),
	pullRequestCommentId: z.string().optional().describe('the pull request comment id'),
	pullRequestURL: z.url().optional().describe('the pull request url'),
});

type DeployOptions = z.infer<typeof DeployOptionsSchema>;

export interface BundleOptions extends DeployOptions {
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
			if (/\.[jt]s?$/.test(filename) && !filename.includes('.generated.')) {
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
		const buildResult = await Bun.build(config);
		if (!buildResult.success) {
			// Collect all build errors
			const errorMessages = buildResult.logs.map((log) => log.message).join('\n');
			throw new Error(errorMessages || 'Build failed');
		}
		// Fix duplicate exports caused by Bun splitting bug
		// See: https://github.com/oven-sh/bun/issues/5344
		await fixDuplicateExportsInDirectory(outDir, false);
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
	if (existsSync(appFile)) {
		const appContent = await Bun.file(appFile).text();
		const analysis = analyzeWorkbench(appContent);

		if (analysis.hasWorkbench) {
			// Encode workbench config for environment variable
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
				// Generate workbench files on the fly instead of using files from package
				const tempWorkbenchDir = join(outDir, 'temp-workbench');
				mkdirSync(tempWorkbenchDir, { recursive: true });

				// Generate files using templates
				await Bun.write(join(tempWorkbenchDir, 'main.tsx'), generateWorkbenchMainTsx(config));
				const workbenchIndexFile = join(tempWorkbenchDir, 'index.html');
				await Bun.write(workbenchIndexFile, generateWorkbenchIndexHtml());

				// Bundle workbench using generated files
				// NOTE: Don't set 'root' to tempWorkbenchDir because it breaks module resolution
				// Bun needs to resolve @agentuity/* packages from the project's node_modules
				const workbenchBuildConfig: Bun.BuildConfig = {
					entrypoints: [workbenchIndexFile],
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
					process.exit(1);
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

	await Bun.write(
		`${outDir}/package.json`,
		JSON.stringify({ name: pkgContents.name, version: pkgContents.version }, null, 2)
	);

	await Bun.write(
		`${outDir}/agentuity.metadata.json`,
		dev ? JSON.stringify(buildmetadata, null, 2) : JSON.stringify(buildmetadata)
	);
}
