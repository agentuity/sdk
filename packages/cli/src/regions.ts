/**
 * Region caching utilities for avoiding repeated API calls
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@agentuity/core';
import { listRegions, type RegionList } from '@agentuity/server';
import type { APIClient } from './api.ts';
import { getDefaultConfigDir } from './config.ts';
import { pathExists } from './node-compat/fs.ts';

const REGIONS_CACHE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const LEGACY_REGIONS_CACHE_FILE = 'regions.json';

function getRegionsCacheFile(profileName: string): string {
	return `regions-${profileName}.json`;
}

async function removeLegacyRegionsCache(logger: Logger): Promise<void> {
	try {
		const legacyPath = join(getDefaultConfigDir(), LEGACY_REGIONS_CACHE_FILE);
		if (await pathExists(legacyPath)) {
			await unlink(legacyPath);
			logger.trace('removed legacy regions cache file');
		}
	} catch {
		// Ignore errors when removing legacy file
	}
}

interface RegionsCacheData {
	timestamp: number;
	regions: RegionList;
}

async function getCachedRegions(profileName: string, logger: Logger): Promise<RegionList | null> {
	try {
		// Clean up legacy single-file cache from older versions
		await removeLegacyRegionsCache(logger);

		const cachePath = join(getDefaultConfigDir(), getRegionsCacheFile(profileName));
		if (!(await pathExists(cachePath))) {
			return null;
		}
		const data: RegionsCacheData = JSON.parse(await readFile(cachePath, 'utf-8'));
		const age = Date.now() - data.timestamp;
		if (age > REGIONS_CACHE_MAX_AGE_MS) {
			logger.trace('regions cache expired for profile %s (age: %dms)', profileName, age);
			return null;
		}
		logger.trace('using cached regions for profile %s (age: %dms)', profileName, age);
		return data.regions;
	} catch (error) {
		logger.trace('failed to read regions cache for profile %s: %s', profileName, error);
		return null;
	}
}

async function saveRegionsCache(
	profileName: string,
	regions: RegionList,
	logger: Logger
): Promise<void> {
	try {
		const cacheDir = getDefaultConfigDir();
		await mkdir(cacheDir, { recursive: true });
		const cachePath = join(cacheDir, getRegionsCacheFile(profileName));
		const data: RegionsCacheData = {
			timestamp: Date.now(),
			regions,
		};
		await writeFile(cachePath, JSON.stringify(data));
		logger.trace('saved regions cache for profile %s', profileName);
	} catch (error) {
		logger.trace('failed to save regions cache for profile %s: %s', profileName, error);
	}
}

/**
 * Fetch regions from API with caching
 */
export async function fetchRegionsWithCache(
	profileName: string,
	apiClient: APIClient,
	logger: Logger
): Promise<RegionList> {
	const cached = await getCachedRegions(profileName, logger);
	if (cached) {
		return cached;
	}
	const regions = await listRegions(apiClient);
	await saveRegionsCache(profileName, regions, logger);
	return regions;
}
