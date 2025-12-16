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
import type { Logger } from '../../../types';

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
			} else if (importPath) {
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
			assets.push({
				filename: assetPath,
				kind: getAssetKind(relativePath, isEntry),
				contentType: getContentType(relativePath),
				size: stats.size,
			});
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
							assets.push({
								filename: assetPath,
								kind: 'static',
								contentType: getContentType(entry.name),
								size: stats.size,
							});
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
				agentuity: pkgContents.dependencies?.['@agentuity/runtime'] || 'unknown',
				arch: process.arch,
				platform: process.platform,
			},
			git: await getGitInfo(rootDir, logger),
		},
	};

	return metadata;
}

/**
 * Get git information (branch, repo, provider, tags)
 * Based on legacy bundler.ts implementation
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
