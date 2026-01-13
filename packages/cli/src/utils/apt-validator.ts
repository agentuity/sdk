import type { Logger } from '@agentuity/core';
import type { Config } from '../types';
import { getAppBaseURL } from '@agentuity/server';
import { getDefaultConfigDir } from '../config';
import { join } from 'node:path';
import { z } from 'zod';

export interface InvalidPackage {
	package: string;
	error: string;
	requestedVersion?: string;
	availableVersions?: string[];
	searchUrl: string;
}

export interface AptValidationResult {
	valid: string[];
	invalid: InvalidPackage[];
}

const InvalidPackageSchema = z.object({
	package: z.string(),
	error: z.string(),
	requestedVersion: z.string().optional(),
	availableVersions: z.array(z.string()).optional(),
	searchUrl: z.string(),
});

const ValidateAptDependenciesResponseSchema = z.object({
	success: z.boolean(),
	data: z
		.object({
			valid: z.array(z.string()),
			invalid: z.array(InvalidPackageSchema),
		})
		.optional(),
	message: z.string().optional(),
});

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds client-side timeout

interface CacheEntry {
	timestamp: number;
}

interface ValidationCache {
	version: number;
	entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function getCachePath(): string {
	return join(getDefaultConfigDir(), 'dependency-validation.json');
}

async function loadCache(logger: Logger): Promise<ValidationCache> {
	const cachePath = getCachePath();
	try {
		const file = Bun.file(cachePath);
		if (await file.exists()) {
			const content = await file.json();
			if (content.version === CACHE_VERSION) {
				return content as ValidationCache;
			}
			logger.debug('Cache version mismatch, starting fresh');
		}
	} catch (err) {
		logger.debug('Failed to load validation cache: %s', err);
	}
	return { version: CACHE_VERSION, entries: {} };
}

async function saveCache(cache: ValidationCache, logger: Logger): Promise<void> {
	const cachePath = getCachePath();
	try {
		await Bun.write(cachePath, JSON.stringify(cache, null, 2));
	} catch (err) {
		logger.debug('Failed to save validation cache: %s', err);
	}
}

function isCacheEntryValid(entry: CacheEntry): boolean {
	return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Validate apt dependencies against the Debian package repository.
 * Uses a local cache to avoid redundant API calls.
 * Calls the app API which checks packages against snapshot.debian.org.
 */
export async function validateAptDependencies(
	packages: string[],
	region: string,
	config: Config | null,
	logger: Logger
): Promise<AptValidationResult> {
	if (packages.length === 0) {
		return { valid: [], invalid: [] };
	}

	const cache = await loadCache(logger);
	const now = Date.now();

	const cachedValid: string[] = [];
	const uncachedPackages: string[] = [];

	// Check cache for each package (only valid packages are cached)
	for (const pkg of packages) {
		const entry = cache.entries[pkg];
		if (entry && isCacheEntryValid(entry)) {
			cachedValid.push(pkg);
			logger.debug('Cache hit (valid): %s', pkg);
		} else {
			uncachedPackages.push(pkg);
			logger.debug('Cache miss: %s', pkg);
		}
	}

	// If all packages are cached, return immediately
	if (uncachedPackages.length === 0) {
		logger.debug('All %d packages found in cache', packages.length);
		return { valid: cachedValid, invalid: [] };
	}

	logger.debug(
		'Validating %d uncached packages (%d cached)',
		uncachedPackages.length,
		packages.length - uncachedPackages.length
	);

	const appBaseUrl = getAppBaseURL(region, config?.overrides);
	const url = `${appBaseUrl}/api/cli/validate/apt-dependencies`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ packages: uncachedPackages }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to validate apt dependencies: HTTP ${response.status} - ${text}`);
	}

	const json = await response.json();
	const parsed = ValidateAptDependenciesResponseSchema.safeParse(json);

	if (!parsed.success) {
		throw new Error(`Invalid API response: ${parsed.error.message}`);
	}

	const result = parsed.data;

	if (!result.success || !result.data) {
		throw new Error(result.message ?? 'Failed to validate apt dependencies');
	}

	// Update cache with valid results only (don't cache invalid packages)
	for (const pkg of result.data.valid) {
		cache.entries[pkg] = { timestamp: now };
	}

	await saveCache(cache, logger);

	logger.debug(
		'Apt validation complete: %d valid, %d invalid (from API)',
		result.data.valid.length,
		result.data.invalid.length
	);

	// Combine cached and fresh results
	return {
		valid: [...cachedValid, ...result.data.valid],
		invalid: result.data.invalid,
	};
}
