/**
 * Metadata Generator
 *
 * Generates agentuity.metadata.json and .routemapping.json from discovered agents and routes
 */

import { join, dirname } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import type { BuildMetadata } from '@agentuity/server';
import type { AgentMetadata } from './agent-discovery';
import type { RouteMetadata } from './route-discovery';
import type { Logger, DeployOptions } from '../../../types';
import { getVersion } from '../../../version';

interface ViteManifestEntry {
	file: string;
	src?: string;
	isEntry?: boolean;
	css?: string[];
	assets?: string[];
}

interface AssetInfo {
	filename: string;
	kind: string;
	contentType: string;
	size: number;
	contentEncoding?: string;
}

function getContentType(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'js':
		case 'mjs':
			return 'application/javascript';
		case 'css':
			return 'text/css';
		case 'html':
			return 'text/html';
		case 'json':
			return 'application/json';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'gif':
			return 'image/gif';
		case 'svg':
			return 'image/svg+xml';
		case 'webp':
			return 'image/webp';
		case 'ico':
			return 'image/x-icon';
		case 'woff':
			return 'font/woff';
		case 'woff2':
			return 'font/woff2';
		case 'ttf':
			return 'font/ttf';
		case 'eot':
			return 'application/vnd.ms-fontobject';
		default:
			return 'application/octet-stream';
	}
}

/**
 * Determine if an asset should be compressed with gzip.
 * The result is included in asset metadata so the API can generate
 * presigned URLs with matching Content-Encoding.
 */
function shouldCompressAsset(asset: {
	filename: string;
	contentType: string;
	kind: string;
}): boolean {
	const ct = asset.contentType.toLowerCase();
	const filename = asset.filename.toLowerCase();

	if (ct.startsWith('image/') && ct !== 'image/svg+xml') {
		return false;
	}
	if (ct.startsWith('video/') || ct.startsWith('audio/')) {
		return false;
	}
	if (ct === 'font/woff' || ct === 'font/woff2') {
		return false;
	}
	if (/\.(zip|gz|tgz|tar|bz2|br)$/.test(filename)) {
		return false;
	}

	if (
		ct.startsWith('text/') ||
		ct === 'application/javascript' ||
		ct === 'application/json' ||
		ct === 'application/xml' ||
		ct === 'application/xhtml+xml' ||
		ct === 'image/svg+xml'
	) {
		return true;
	}

	if (ct === 'font/ttf' || ct === 'application/vnd.ms-fontobject') {
		return true;
	}

	if (
		asset.kind === 'entry-point' ||
		asset.kind === 'script' ||
		asset.kind === 'stylesheet' ||
		asset.kind === 'sourcemap'
	) {
		return true;
	}

	return false;
}

function getAssetKind(filename: string, isEntry: boolean = false): string {
	const ext = filename.split('.').pop()?.toLowerCase();

	// Check for sourcemap
	if (filename.endsWith('.js.map') || filename.endsWith('.css.map')) {
		return 'sourcemap';
	}

	switch (ext) {
		case 'js':
		case 'mjs':
			// Distinguish entry-point from regular scripts
			return isEntry ? 'entry-point' : 'script';
		case 'css':
			return 'stylesheet';
		case 'png':
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'svg':
		case 'webp':
			return 'image';
		case 'ico':
			return 'asset';
		case 'woff':
		case 'woff2':
		case 'ttf':
		case 'eot':
			return 'font';
		default:
			return 'other';
	}
}

export interface MetadataGeneratorOptions {
	rootDir: string;
	projectId: string;
	orgId?: string;
	deploymentId?: string;
	agents: AgentMetadata[];
	routes: RouteMetadata[];
	dev?: boolean;
	logger: Logger;
	deploymentOptions?: DeployOptions;
}

/**
 * Normalize an agent filename/import path into a key for lookup
 */
function normalizeImportKey(path: string): string {
	// Strip leading './' or 'src/' or '@'
	let p = path.replace(/^src\//, '');
	if (p.startsWith('./')) p = p.slice(2);
	if (p.startsWith('@')) p = p.slice(1);

	// Drop extension
	p = p.replace(/\.(t|j)sx?$/, '');

	// Drop common module file suffixes (agent.ts, index.ts become just the directory)
	p = p.replace(/\/(agent|index)$/, '');

	return p;
}

/**
 * Generate agentuity.metadata.json
 */
export async function generateMetadata(options: MetadataGeneratorOptions): Promise<BuildMetadata> {
	const { rootDir, projectId, orgId = '', agents, routes, logger } = options;

	// Build agent lookup by import path for route schema enrichment
	const agentsByImportKey = new Map<string, AgentMetadata>();
	for (const agent of agents) {
		if (!agent.filename) continue;
		const key = normalizeImportKey(agent.filename);
		agentsByImportKey.set(key, agent);
		logger.trace(`Agent lookup: ${key} -> ${agent.name}`);
	}

	// Enrich routes with schemas from agents (if not already set)
	const enrichedRoutes = routes.map((route) => {
		let schema = route.schema ? { ...route.schema } : undefined;

		const importPath = route.config?.agentImportPath as string | undefined;

		if (importPath) {
			const key = normalizeImportKey(importPath);
			const agent = agentsByImportKey.get(key);

			if (agent && (agent.inputSchemaCode || agent.outputSchemaCode)) {
				// Initialize schema object if needed
				if (!schema) schema = {};

				// Only fill in missing pieces; allow explicit route schema to override
				if (!schema.input && agent.inputSchemaCode) {
					schema.input = agent.inputSchemaCode;
					logger.trace(`Route ${route.path}: added input schema from agent ${agent.name}`);
				}
				if (!schema.output && agent.outputSchemaCode) {
					schema.output = agent.outputSchemaCode;
					logger.trace(`Route ${route.path}: added output schema from agent ${agent.name}`);
				}
			} else {
				logger.trace(`No agent found for import path ${importPath} in route ${route.filename}`);
			}
		}

		return {
			...route,
			schema,
		};
	});

	// Read package.json for project metadata
	const pkgPath = join(rootDir, 'package.json');
	let pkgContents: {
		name?: string;
		version?: string;
		description?: string;
		keywords?: string[];
		dependencies?: Record<string, string>;
	} = {};

	if (existsSync(pkgPath)) {
		try {
			const pkgText = Bun.file(pkgPath);
			pkgContents = JSON.parse(await pkgText.text());
		} catch (error) {
			logger.warn(`Failed to read package.json: ${error}`);
		}
	}

	// Read asset manifests from Vite builds
	const assets: AssetInfo[] = [];
	const agentuityDir = join(rootDir, '.agentuity');
	const seenAssets = new Set<string>(); // Track unique assets to avoid duplicates

	// Helper to add asset with metadata
	const addAsset = (relativePath: string, prefix: string, isEntry: boolean = false) => {
		const assetPath = `${prefix}/${relativePath}`;

		// Skip if already added
		if (seenAssets.has(assetPath)) {
			return;
		}

		const fullPath = join(agentuityDir, prefix, relativePath);
		if (existsSync(fullPath)) {
			const stats = statSync(fullPath);

			// Skip empty marker files (.gitkeep, .keep, etc.)
			if (stats.size === 0) {
				return;
			}

			seenAssets.add(assetPath);
			const kind = getAssetKind(relativePath, isEntry);
			const contentType = getContentType(relativePath);
			const assetInfo: AssetInfo = {
				filename: assetPath,
				kind,
				contentType,
				size: stats.size,
			};
			if (shouldCompressAsset(assetInfo)) {
				assetInfo.contentEncoding = 'gzip';
			}
			assets.push(assetInfo);
		}
	};

	// Read client manifest
	const clientManifestPath = join(agentuityDir, 'client', '.vite', 'manifest.json');
	if (existsSync(clientManifestPath)) {
		try {
			const clientManifest: Record<string, ViteManifestEntry> = JSON.parse(
				readFileSync(clientManifestPath, 'utf-8')
			);
			for (const entry of Object.values(clientManifest)) {
				// Mark JS files as entry-point if they are entry files
				const isEntry = entry.isEntry === true && entry.file.endsWith('.js');
				addAsset(entry.file, 'client', isEntry);

				// Add sourcemap if it exists
				const sourcemapPath = entry.file + '.map';
				const fullSourcemapPath = join(agentuityDir, 'client', sourcemapPath);
				if (existsSync(fullSourcemapPath)) {
					addAsset(sourcemapPath, 'client');
				}

				if (entry.css) {
					entry.css.forEach((css) => {
						addAsset(css, 'client');
						// Add CSS sourcemap if it exists
						const cssMapPath = css + '.map';
						const fullCssMapPath = join(agentuityDir, 'client', cssMapPath);
						if (existsSync(fullCssMapPath)) {
							addAsset(cssMapPath, 'client');
						}
					});
				}
				if (entry.assets) {
					entry.assets.forEach((asset) => addAsset(asset, 'client'));
				}
			}
			logger.trace(`Found ${assets.length} client assets from manifest`);
		} catch (error) {
			logger.warn(`Failed to read client manifest: ${error}`);
		}
	}

	// Read workbench manifest (optional)
	const workbenchManifestPath = join(agentuityDir, 'workbench', '.vite', 'manifest.json');
	if (existsSync(workbenchManifestPath)) {
		try {
			const workbenchManifest: Record<string, ViteManifestEntry> = JSON.parse(
				readFileSync(workbenchManifestPath, 'utf-8')
			);
			for (const entry of Object.values(workbenchManifest)) {
				const isEntry = entry.isEntry === true && entry.file.endsWith('.js');
				addAsset(entry.file, 'workbench', isEntry);

				// Add sourcemap if it exists
				const sourcemapPath = entry.file + '.map';
				const fullSourcemapPath = join(agentuityDir, 'workbench', sourcemapPath);
				if (existsSync(fullSourcemapPath)) {
					addAsset(sourcemapPath, 'workbench');
				}

				if (entry.css) {
					entry.css.forEach((css) => {
						addAsset(css, 'workbench');
						// Add CSS sourcemap if it exists
						const cssMapPath = css + '.map';
						const fullCssMapPath = join(agentuityDir, 'workbench', cssMapPath);
						if (existsSync(fullCssMapPath)) {
							addAsset(cssMapPath, 'workbench');
						}
					});
				}
				if (entry.assets) {
					entry.assets.forEach((asset) => addAsset(asset, 'workbench'));
				}
			}
			logger.trace(`Found ${assets.length} total assets (including workbench)`);
		} catch (error) {
			logger.warn(`Failed to read workbench manifest: ${error}`);
		}
	}

	// Scan public/ directory for static files
	const publicDir = join(rootDir, 'public');
	if (existsSync(publicDir)) {
		try {
			function scanDirectory(dir: string, prefix: string = '') {
				const entries = readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
					const fullPath = join(dir, entry.name);

					if (entry.isDirectory()) {
						scanDirectory(fullPath, relativePath);
					} else if (entry.isFile()) {
						const stats = statSync(fullPath);
						// Skip empty files
						if (stats.size === 0) continue;

						const assetPath = `public/${relativePath}`;
						if (!seenAssets.has(assetPath)) {
							seenAssets.add(assetPath);
							const contentType = getContentType(entry.name);
							const assetInfo: AssetInfo = {
								filename: assetPath,
								kind: 'static',
								contentType,
								size: stats.size,
							};
							if (shouldCompressAsset(assetInfo)) {
								assetInfo.contentEncoding = 'gzip';
							}
							assets.push(assetInfo);
						}
					}
				}
			}

			scanDirectory(publicDir);
			logger.trace(`Found ${assets.length} total assets (including public/)`);
		} catch (error) {
			logger.warn(`Failed to scan public directory: ${error}`);
		}
	}

	// Build metadata structure
	const metadata: BuildMetadata = {
		routes: enrichedRoutes.map((route) => ({
			id: route.id,
			filename: route.filename,
			path: route.path,
			method: route.method as 'get' | 'post' | 'put' | 'delete' | 'patch',
			version: route.version,
			type: route.type,
			agentIds: route.agentIds,
			config: route.config,
			schema: route.schema,
		})),
		agents: agents.map((agent) => ({
			filename: agent.filename,
			id: agent.id,
			agentId: agent.agentId,
			version: agent.version,
			name: agent.name,
			description: agent.description,
			projectId,
			schema:
				agent.inputSchemaCode || agent.outputSchemaCode
					? {
							input: agent.inputSchemaCode,
							output: agent.outputSchemaCode,
						}
					: undefined,
			evals: agent.evals?.map((evalItem) => ({
				filename: evalItem.filename,
				id: evalItem.id,
				evalId: evalItem.evalId,
				name: evalItem.name,
				version: evalItem.version,
				description: evalItem.description,
				agentIdentifier: evalItem.agentIdentifier,
				projectId: evalItem.projectId,
			})),
		})),
		assets,
		project: {
			id: projectId,
			name: pkgContents.name || 'unknown',
			version: pkgContents.version,
			description: pkgContents.description,
			keywords: pkgContents.keywords,
			orgId,
		},
		deployment: {
			id: options.deploymentId || '',
			date: new Date().toISOString(),
			build: {
				bun: Bun.version,
				agentuity: getVersion(), // CLI version used to build
				arch: process.arch,
				platform: process.platform,
			},
			git: await getGitInfo(rootDir, logger),
		},
	};

	if (options.deploymentOptions) {
		const git = { ...(metadata.deployment.git ?? {}), ...options.deploymentOptions };
		if (options.deploymentOptions.pullRequestNumber) {
			git.pull_request = {
				number: options.deploymentOptions.pullRequestNumber,
				commentId: options.deploymentOptions.pullRequestCommentId,
				url: options.deploymentOptions.pullRequestURL,
			};
			delete git.pullRequestCommentId;
			delete git.pullRequestNumber;
			delete git.pullRequestURL;
		}
		metadata.deployment.git = git;
	}

	return metadata;
}

/**
 * Get git information (branch, repo, provider, tags)
 */
async function getGitInfo(
	rootDir: string,
	logger: Logger
): Promise<
	| {
			branch?: string;
			repo?: string;
			provider?: string;
			tags?: string[];
			commit?: string;
			message?: string;
	  }
	| undefined
> {
	if (!Bun.which('git')) {
		logger.trace('git not found in PATH');
		return undefined;
	}

	try {
		// Find .git directory (may be in parent directories for monorepos)
		let gitDir = join(rootDir, '.git');
		let parentDir = dirname(dirname(gitDir));
		while (!existsSync(gitDir) && parentDir !== dirname(parentDir) && gitDir !== '/') {
			gitDir = join(parentDir, '.git');
			parentDir = dirname(parentDir);
		}

		if (!existsSync(gitDir)) {
			logger.trace('No .git directory found');
			return undefined;
		}

		const $ = Bun.$;
		const gitInfo: {
			branch?: string;
			repo?: string;
			provider?: string;
			tags?: string[];
			commit?: string;
			message?: string;
		} = {
			provider: 'git',
		};

		// Get git tags pointing to HEAD
		const tagResult = $`git tag -l --points-at HEAD`.nothrow().quiet();
		if (tagResult) {
			const tagText = await tagResult.text();
			if (tagText) {
				gitInfo.tags = tagText
					.trim()
					.split(/\n/)
					.map((s) => s.trim())
					.filter(Boolean);
			}
		}

		// Get current branch
		const branchResult = $`git branch --show-current`.nothrow().quiet();
		if (branchResult) {
			const branchText = await branchResult.text();
			if (branchText) {
				gitInfo.branch = branchText.trim();
			}
		}

		// Get commit SHA
		const commitResult = $`git rev-parse HEAD`.nothrow().quiet();
		if (commitResult) {
			const commitText = await commitResult.text();
			if (commitText) {
				gitInfo.commit = commitText.trim();

				// Get commit message
				const msgResult = $`git log --pretty=format:%s -n1 ${gitInfo.commit}`.nothrow().quiet();
				if (msgResult) {
					const msgText = await msgResult.text();
					if (msgText) {
						gitInfo.message = msgText.trim();
					}
				}
			}
		}

		// Get remote origin URL and parse
		const originResult = $`git config --get remote.origin.url`.nothrow().quiet();
		if (originResult) {
			const originText = await originResult.text();
			if (originText) {
				const remoteUrl = originText.trim();

				// Parse provider and repo from URL
				if (remoteUrl.includes('github.com')) {
					gitInfo.provider = 'github';
					const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
					if (match) {
						gitInfo.repo = `https://github.com/${match[1]}`;
					}
				} else if (remoteUrl.includes('gitlab.com')) {
					gitInfo.provider = 'gitlab';
					const match = remoteUrl.match(/gitlab\.com[:/](.+?)(?:\.git)?$/);
					if (match) {
						gitInfo.repo = `https://gitlab.com/${match[1]}`;
					}
				} else if (remoteUrl.includes('bitbucket.org')) {
					gitInfo.provider = 'bitbucket';
					const match = remoteUrl.match(/bitbucket\.org[:/](.+?)(?:\.git)?$/);
					if (match) {
						gitInfo.repo = `https://bitbucket.org/${match[1]}`;
					}
				} else {
					gitInfo.repo = remoteUrl;
				}
			}
		}

		// Build tags array with defaults
		const tags = new Set(gitInfo.tags ?? []);
		tags.add('latest');
		if (gitInfo.branch) {
			tags.add(gitInfo.branch);
		}
		if (gitInfo.commit) {
			tags.add(gitInfo.commit.substring(0, 7));
		}
		gitInfo.tags = Array.from(tags);

		return gitInfo;
	} catch (error) {
		logger.trace(`Failed to get git info: ${error}`);
		return undefined;
	}
}

/**
 * Generate AGENTS.md content for AI coding agents
 */
function generateAgentsMd(metadata: BuildMetadata): string {
	const lines: string[] = [];

	lines.push('# Compiled Agentuity Application');
	lines.push('');
	lines.push(
		'This directory contains compiled and bundled source code from an Agentuity application.'
	);
	lines.push('');

	// Add source repository info if available
	if (metadata.deployment?.git?.repo) {
		lines.push('## Source Repository');
		lines.push('');
		lines.push(`**Repository:** ${metadata.deployment.git.repo}`);

		if (metadata.deployment.git.branch) {
			lines.push(`**Branch:** ${metadata.deployment.git.branch}`);
		}

		if (metadata.deployment.git.commit) {
			const shortCommit = metadata.deployment.git.commit.substring(0, 7);
			const commitUrl = metadata.deployment.git.repo.endsWith('.git')
				? metadata.deployment.git.repo.slice(0, -4)
				: metadata.deployment.git.repo;
			lines.push(
				`**Commit:** [\`${shortCommit}\`](${commitUrl}/commit/${metadata.deployment.git.commit})`
			);
		}

		if (metadata.deployment.git.message) {
			lines.push(`**Message:** ${metadata.deployment.git.message}`);
		}

		lines.push('');
	}

	// Add build info
	lines.push('## Build Information');
	lines.push('');
	if (metadata.project?.name) {
		lines.push(
			`**Project:** ${metadata.project.name}${metadata.project.version ? ` v${metadata.project.version}` : ''}`
		);
	}
	if (metadata.project?.id) {
		lines.push(`**Project ID:** ${metadata.project.id}`);
	}
	if (metadata.project?.orgId) {
		lines.push(`**Org ID:** ${metadata.project.orgId}`);
	}
	if (metadata.deployment.id) {
		lines.push(`**Deployment ID:** ${metadata.deployment.id}`);
	}
	if (metadata.deployment?.build) {
		lines.push(
			`**Built with:** Agentuity CLI v${metadata.deployment.build.agentuity}, Bun v${metadata.deployment.build.bun}`
		);
		lines.push(
			`**Platform:** ${metadata.deployment.build.platform}-${metadata.deployment.build.arch}`
		);
	}
	if (metadata.deployment?.date) {
		lines.push(`**Build date:** ${metadata.deployment.date}`);
	}
	lines.push('');

	// Add structure overview
	lines.push('## Structure');
	lines.push('');
	lines.push('```');
	lines.push('.agentuity/');
	lines.push('├── app.js                     # Bundled server application');
	lines.push('├── agentuity.metadata.json    # Build metadata and schemas');
	if (metadata.assets?.some((a) => a.filename.startsWith('client/'))) {
		lines.push('├── client/                # Frontend assets (fallback, CDN by default)');
	}
	if (metadata.assets?.some((a) => a.filename.startsWith('public/'))) {
		lines.push('├── public/                # Static assets');
	}
	lines.push('└── AGENTS.md                  # This file');
	lines.push('```');
	lines.push('');

	// Add agent/route details
	if (metadata.agents && metadata.agents.length > 0) {
		lines.push('## Agents');
		lines.push('');
		lines.push(`This application defines ${metadata.agents.length} agent(s):`);
		lines.push('');
		for (const agent of metadata.agents) {
			lines.push(`- **${agent.name}** (ID: \`${agent.id}\`)`);
		}
		lines.push('');
	}

	if (metadata.routes && metadata.routes.length > 0) {
		lines.push('## Routes');
		lines.push('');
		lines.push(`This application defines ${metadata.routes.length} route(s):`);
		lines.push('');
		for (const route of metadata.routes) {
			lines.push(`- \`${route.method.toUpperCase()} ${route.path}\` (${route.type})`);
		}
		lines.push('');
	}

	// Add runtime environment info
	lines.push('## Runtime Environment');
	lines.push('');
	lines.push('When deployed, this application runs in a managed runtime environment with:');
	lines.push('');
	lines.push('**User & Permissions:**');
	lines.push('- User: `agentuity` (UID: 1022, GID: 1777)');
	lines.push('- Home directory: `/home/agentuity`');
	lines.push('- Working directory: `/home/agentuity/app` (application code deployed here)');
	lines.push('- Logs directory: `/home/agentuity/logs`');
	lines.push('- Temp directory: `/home/agentuity/tmp`');
	lines.push('');
	lines.push('**Pre-installed Tools:**');
	lines.push('- **Runtimes:** Node.js 24, Bun 1.x');
	lines.push('- **AI Tools:** Amp, Opencode AI, Claude Code');
	lines.push('- **Version Control:** git, GitHub CLI (gh)');
	lines.push('- **Browser Automation:** Chromium, ChromeDriver, Xvfb (headless display)');
	lines.push('- **Media Processing:** ffmpeg');
	lines.push('- **Network Tools:** curl, wget, netcat, dnsutils');
	lines.push('- **Other:** openssh-client, openssh-sftp-server, strace, unzip, fuse');
	lines.push('');
	lines.push('**Environment Variables:**');
	lines.push('- `AGENTUITY_DATA_DIR=/home/agentuity/data` - Persistent data storage');
	lines.push('- `AGENTUITY_LOG_DIR=/home/agentuity/logs` - Application logs');
	lines.push('- `CHROME_BIN=/usr/bin/chromium` - Chromium browser path');
	lines.push('- `DISPLAY=:99` - X11 display for headless browser');
	lines.push(
		'- `PATH` includes `/home/agentuity/.local/bin` and `/home/agentuity/.agentuity/bin`'
	);
	lines.push('');
	lines.push('**Ports:**');
	lines.push(
		'- `3000: This default port that the project is running. Use PORT environment if not available'
	);
	lines.push('');

	// Add note about metadata
	lines.push('## For AI Coding Agents');
	lines.push('');
	lines.push(
		'This is production-ready compiled code. For development and source code modifications:'
	);
	lines.push('');
	if (metadata.deployment?.git?.repo) {
		lines.push(`1. Clone the source repository: ${metadata.deployment.git.repo}`);
		lines.push('2. Make changes to source files in `src/`');
		lines.push('3. Run `agentuity build` to rebuild this bundle');
	} else {
		lines.push('1. Locate the original source repository');
		lines.push('2. Make changes to source files in `src/`');
		lines.push('3. Run `agentuity build` to rebuild this bundle');
	}
	lines.push('');
	lines.push(
		'See `agentuity.metadata.json` for detailed information about agents, routes, and schemas.'
	);

	return lines.join('\n');
}

/**
 * Write agentuity.metadata.json to .agentuity directory
 */
export function writeMetadataFile(
	rootDir: string,
	metadata: BuildMetadata,
	dev: boolean,
	logger: Logger
): void {
	const agentuityDir = join(rootDir, '.agentuity');

	// Ensure .agentuity directory exists
	if (!existsSync(agentuityDir)) {
		mkdirSync(agentuityDir, { recursive: true });
	}

	const metadataPath = join(agentuityDir, 'agentuity.metadata.json');
	const metadataContent = dev ? JSON.stringify(metadata, null, 2) : JSON.stringify(metadata);

	writeFileSync(metadataPath, metadataContent, 'utf-8');
	logger.trace('Wrote agentuity.metadata.json');

	// Write AGENTS.md for AI coding agents
	if (!dev) {
		const agentMdPath = join(agentuityDir, 'AGENTS.md');
		const agentMdContent = generateAgentsMd(metadata);

		writeFileSync(agentMdPath, agentMdContent, 'utf-8');
		logger.trace('Wrote AGENTS.md');
	}
}

/**
 * Generate .routemapping.json for runtime route tracking
 */
export function generateRouteMapping(
	rootDir: string,
	routes: RouteMetadata[],
	dev: boolean,
	logger: Logger
): void {
	const agentuityDir = join(rootDir, '.agentuity');

	// Ensure .agentuity directory exists
	if (!existsSync(agentuityDir)) {
		mkdirSync(agentuityDir, { recursive: true });
	}

	const routeMapping: Record<string, string> = {};
	for (const route of routes) {
		routeMapping[`${route.method} ${route.path}`] = route.id;
	}

	const routeMappingPath = join(agentuityDir, '.routemapping.json');
	const routeMappingContent = dev
		? JSON.stringify(routeMapping, null, 2)
		: JSON.stringify(routeMapping);

	writeFileSync(routeMappingPath, routeMappingContent, 'utf-8');
	logger.trace('Wrote .routemapping.json');
}
