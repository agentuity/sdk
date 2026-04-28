/**
 * Build metadata generator for non-Agentuity framework deployments.
 *
 * For Agentuity native apps, the existing metadata-generator.ts creates
 * full BuildMetadata with routes, agents, assets from the Vite pipeline.
 *
 * For other frameworks (Next.js, Vite, SvelteKit, etc.), this module
 * generates a BuildMetadata from the BuildResult + LaunchMetadata,
 * with empty routes/agents and assets enumerated from the static dir.
 */

import { join, relative } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { type BuildMetadata, getContentType } from '@agentuity/server';
import type { z } from 'zod';
import { DeploymentConfig } from '@agentuity/server';
import type { BuildResult } from './cmd/build/adapters/types.ts';
import type { PackageResult } from './cmd/build/package/index.ts';
import type { DeployOptions, Logger } from './types.ts';
import { getVersion } from './version.ts';
import { getGitInfo, buildGitTags } from './utils/git.ts';

/**
 * Asset info matching the BuildMetadata schema.
 */
interface AssetInfo {
	filename: string;
	kind: string;
	contentType: string;
	size: number;
	contentEncoding?: string;
}

/**
 * Determine if an asset should be compressed with gzip for CDN upload.
 */
function shouldCompress(contentType: string): boolean {
	const compressible = [
		'text/',
		'application/javascript',
		'application/json',
		'application/xml',
		'application/xhtml+xml',
		'image/svg+xml',
	];
	return compressible.some((prefix) => contentType.startsWith(prefix));
}

/**
 * Recursively enumerate static assets from a directory.
 */
function enumerateAssets(dir: string, baseDir: string): AssetInfo[] {
	const assets: AssetInfo[] = [];

	if (!existsSync(dir)) return assets;

	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			// Skip dot-directories and node_modules
			if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
			assets.push(...enumerateAssets(fullPath, baseDir));
		} else {
			// Skip dot-files
			if (entry.name.startsWith('.')) continue;

			const stats = statSync(fullPath);
			if (stats.size === 0) continue;

			const relativePath = relative(baseDir, fullPath);
			const contentType = getContentType(entry.name);

			const asset: AssetInfo = {
				filename: relativePath,
				kind: getAssetKind(entry.name),
				contentType,
				size: stats.size,
			};

			if (shouldCompress(contentType)) {
				asset.contentEncoding = 'gzip';
			}

			assets.push(asset);
		}
	}

	return assets;
}

/**
 * Classify an asset by file extension.
 */
function getAssetKind(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'js':
		case 'mjs':
		case 'cjs':
			return 'script';
		case 'css':
			return 'stylesheet';
		case 'html':
			return 'page';
		case 'json':
			return 'data';
		case 'svg':
		case 'png':
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'webp':
		case 'avif':
		case 'ico':
			return 'image';
		case 'woff':
		case 'woff2':
		case 'ttf':
		case 'otf':
		case 'eot':
			return 'font';
		case 'map':
			return 'sourcemap';
		default:
			return 'static';
	}
}

export interface GenerateDeployMetadataOptions {
	/** Build result from the adapter */
	buildResult: BuildResult;
	/** Package result with launch metadata */
	packageResult: PackageResult;
	/** Absolute path to the project root */
	projectDir: string;
	/** Project ID */
	projectId: string;
	/** Organization ID */
	orgId: string;
	/** Region */
	region: string;
	/** Deployment ID */
	deploymentId: string;
	/** Deployment config from agentuity.json */
	deploymentConfig?: z.infer<typeof DeploymentConfig>;
	/** Deploy CLI options (git info, etc.) */
	deploymentOptions?: DeployOptions;
	/** Logger */
	logger: Logger;
}

/**
 * Generate BuildMetadata for a non-Agentuity framework deployment.
 *
 * Creates the metadata the API expects, with:
 * - Empty routes and agents (non-Agentuity apps don't have them)
 * - Static assets enumerated from BuildResult.staticDir
 * - Launch metadata for the backend to know how to start the app
 * - Standard project/deployment info
 */
export async function generateDeployMetadata(
	options: GenerateDeployMetadataOptions
): Promise<BuildMetadata> {
	const {
		buildResult,
		packageResult,
		projectDir,
		projectId,
		orgId,
		deploymentId,
		deploymentConfig,
		deploymentOptions,
		logger,
	} = options;

	// Read package.json for project info
	let pkgContents: {
		name?: string;
		version?: string;
		description?: string;
		keywords?: string[];
	} = {};

	const pkgPath = join(projectDir, 'package.json');
	if (existsSync(pkgPath)) {
		try {
			pkgContents = JSON.parse(await Bun.file(pkgPath).text());
		} catch (error) {
			logger.warn(`Failed to read package.json: ${error}`);
		}
	}

	// Enumerate static assets if we have a static directory
	const assets: AssetInfo[] = [];
	if (buildResult.staticDir && existsSync(buildResult.staticDir)) {
		const outputDir = buildResult.outputDir;
		const staticAssets = enumerateAssets(buildResult.staticDir, outputDir);
		assets.push(...staticAssets);
		logger.debug(`Found ${assets.length} static assets in ${buildResult.staticDir}`);
	}

	// Build git info
	const gitInfo = await getGitInfo(projectDir, logger);

	const metadata: BuildMetadata = {
		routes: [],
		agents: [],
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
			...deploymentConfig,
			id: deploymentId,
			date: new Date().toISOString(),
			build: {
				bun: Bun.version,
				agentuity: getVersion(),
				arch: process.arch,
				platform: process.platform,
			},
			git: gitInfo,
		},
		launch: packageResult.launch,
	};

	// Build git tags
	if (metadata.deployment.git) {
		metadata.deployment.git.tags = buildGitTags(metadata.deployment.git);
	}

	// Merge deployment options (CI info, etc.)
	if (deploymentOptions) {
		const git = { ...(metadata.deployment.git ?? {}), ...deploymentOptions };
		if (deploymentOptions.pullRequestNumber) {
			git.pull_request = {
				number: deploymentOptions.pullRequestNumber,
				url: deploymentOptions.pullRequestUrl,
			};
			delete (git as Record<string, unknown>).pullRequestNumber;
			delete (git as Record<string, unknown>).pullRequestUrl;
		}
		metadata.deployment.git = git;
	}

	return metadata;
}
