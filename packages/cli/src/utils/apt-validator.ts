import { StructuredError, type Logger } from '@agentuity/core';
import type { Config } from '../types.ts';
import { getAPIBaseURL } from '@agentuity/server';
import { getUserAgent } from '../api.ts';
import { getDefaultConfigDir } from '../config.ts';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';

const AptValidationError = StructuredError('AptValidationError');
const AptValidationAPIError = StructuredError('AptValidationAPIError')<{
	status?: number;
	body?: string;
}>();
const AptValidationResponseError = StructuredError('AptValidationResponseError')<{
	parseError?: string;
}>();

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

const CacheEntrySchema = z.object({
	timestamp: z.number(),
});

const ValidationCacheSchema = z.object({
	version: z.number(),
	entries: z.record(z.string(), CacheEntrySchema),
});

type ValidationCache = z.infer<typeof ValidationCacheSchema>;

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
			const parsed = ValidationCacheSchema.safeParse(content);
			if (parsed.success && parsed.data.version === CACHE_VERSION) {
				return parsed.data;
			}
			logger.debug('Cache invalid or version mismatch, starting fresh');
		}
	} catch (err) {
		logger.debug('Failed to load validation cache: %s', err);
	}
	return { version: CACHE_VERSION, entries: {} };
}

async function saveCache(cache: ValidationCache, logger: Logger): Promise<void> {
	const cachePath = getCachePath();
	try {
		await mkdir(dirname(cachePath), { recursive: true });
		await Bun.write(cachePath, JSON.stringify(cache, null, 2));
	} catch (err) {
		logger.debug('Failed to save validation cache: %s', err);
	}
}

function isCacheEntryValid(entry: z.infer<typeof CacheEntrySchema>): boolean {
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

	const apiBaseUrl = getAPIBaseURL(region, config?.overrides ?? undefined);
	const url = `${apiBaseUrl}/cli/validate/apt-dependencies`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': getUserAgent(config),
		},
		body: JSON.stringify({ packages: uncachedPackages }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new AptValidationAPIError({
			message: `Failed to validate apt dependencies: HTTP ${response.status}`,
			status: response.status,
			body: text,
		});
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch (err) {
		throw new AptValidationResponseError({
			message: 'Invalid JSON in API response',
			parseError: err instanceof Error ? err.message : String(err),
		});
	}

	const parsed = ValidateAptDependenciesResponseSchema.safeParse(json);

	if (!parsed.success) {
		throw new AptValidationResponseError({
			message: 'Invalid API response structure',
			parseError: parsed.error.message,
		});
	}

	const result = parsed.data;

	if (!result.success || !result.data) {
		throw new AptValidationError({
			message: result.message ?? 'Failed to validate apt dependencies',
		});
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
