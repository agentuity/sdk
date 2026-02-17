import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { APIClient } from '../src/api/api';
import { createLogger } from '../src/logger';
import { getUsageSummary, getUsageBreakdown, getUsageTimeseries } from '../src/api';
import { getServiceUrls } from '../src/config';

// Skip this test suite unless explicitly enabled via env var
// These tests require a valid API key and real Catalyst environment
const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_USAGE_INTEGRATION_TESTS === 'true';

// These tests actually call the Catalyst API
// They're skipped by default but can be enabled with ENABLE_USAGE_INTEGRATION_TESTS=true
describe.skipIf(!ENABLE_INTEGRATION_TESTS)('Usage API Integration', () => {
	// Create client and setup
	let client: APIClient;
	let projectId: string;

	beforeAll(() => {
		// Fail if required env vars are missing
		if (!process.env.AGENTUITY_SDK_KEY) {
			throw new Error('AGENTUITY_SDK_KEY required for integration tests');
		}
		if (!process.env.AGENTUITY_CLOUD_PROJECT_ID) {
			throw new Error('AGENTUITY_CLOUD_PROJECT_ID required for integration tests');
		}
		if (!process.env.AGENTUITY_REGION) {
			throw new Error('AGENTUITY_REGION required for integration tests');
		}

		// Create real client pointing to Catalyst
		const urls = getServiceUrls();
		const logger = createLogger('warn');
		client = new APIClient(urls.catalyst, logger);

		// Get project ID from env
		projectId = process.env.AGENTUITY_CLOUD_PROJECT_ID;
	});

	describe('Summary API', () => {
		test('fetches summary for last 30 days', async () => {
			// Get summary for last 30 days
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			const today = new Date();

			const summary = await getUsageSummary(client, projectId, {
				start: thirtyDaysAgo.toISOString(),
				end: today.toISOString(),
			});

			// Basic validation - should have required fields
			expect(summary.projectId).toBe(projectId);
			expect(typeof summary.totalCost).toBe('number');
			expect(typeof summary.llmCost).toBe('number');
			expect(typeof summary.infraCost).toBe('number');
			expect(typeof summary.tokenUsage.totalTokens).toBe('number');
		});
	});

	describe('Breakdown API', () => {
		test('fetches agent breakdown', async () => {
			// Get breakdown by agent
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			const today = new Date();

			const breakdown = await getUsageBreakdown(client, projectId, {
				start: thirtyDaysAgo.toISOString(),
				end: today.toISOString(),
				groupBy: 'agent',
				sortBy: 'cost_desc',
			});

			// Basic validation
			expect(breakdown.projectId).toBe(projectId);
			expect(breakdown.groupBy).toBe('agent');
			// Groups might be empty if no usage in this period
			expect(Array.isArray(breakdown.groups)).toBe(true);
		});

		test('fetches daily breakdown', async () => {
			// Get breakdown by day
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			const today = new Date();

			const breakdown = await getUsageBreakdown(client, projectId, {
				start: thirtyDaysAgo.toISOString(),
				end: today.toISOString(),
				groupBy: 'day',
				sortBy: 'cost_desc',
			});

			// Basic validation
			expect(breakdown.projectId).toBe(projectId);
			expect(breakdown.groupBy).toBe('day');
			// Groups might be empty if no usage in this period
			expect(Array.isArray(breakdown.groups)).toBe(true);
		});
	});

	describe('Timeseries API', () => {
		test('fetches daily timeseries', async () => {
			// Get daily timeseries for 30 days
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			const today = new Date();

			const timeseries = await getUsageTimeseries(client, projectId, {
				start: thirtyDaysAgo.toISOString(),
				end: today.toISOString(),
				granularity: 'day',
				metrics: ['totalCost', 'sessionCount'],
			});

			// Basic validation
			expect(timeseries.projectId).toBe(projectId);
			expect(timeseries.granularity).toBe('day');
			expect(Array.isArray(timeseries.buckets)).toBe(true);

			// Should have metrics in buckets
			if (timeseries.buckets.length > 0) {
				const bucket = timeseries.buckets[0];
				expect(typeof bucket.timestamp).toBe('string');
				expect(typeof bucket.totalCost).toBe('number');
				expect(typeof bucket.sessionCount).toBe('number');
			}
		});

		test('fetches hourly timeseries for recent data', async () => {
			// Get hourly timeseries for last 7 days
			// (hourly might be limited to shorter time ranges)
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			const today = new Date();

			const timeseries = await getUsageTimeseries(client, projectId, {
				start: sevenDaysAgo.toISOString(),
				end: today.toISOString(),
				granularity: 'hour',
				metrics: ['totalCost'],
			});

			// Basic validation
			expect(timeseries.projectId).toBe(projectId);
			expect(timeseries.granularity).toBe('hour');
			expect(Array.isArray(timeseries.buckets)).toBe(true);
		});
	});

	describe('Zero-config API', () => {
		test('getUsageSummary works with zero config', async () => {
			// This test depends on environment variables being set:
			// - AGENTUITY_CLOUD_PROJECT_ID
			// - AGENTUITY_REGION
			// - AGENTUITY_SDK_KEY

			// Shouldn't need client or projectId
			const today = new Date();
			const yesterdayStart = new Date();
			yesterdayStart.setDate(today.getDate() - 1);
			yesterdayStart.setHours(0, 0, 0, 0);

			const summary = await getUsageSummary({
				start: yesterdayStart.toISOString(),
				end: today.toISOString(),
			});

			// Verify it worked
			expect(summary.projectId).toBe(projectId);
		});
	});
});
