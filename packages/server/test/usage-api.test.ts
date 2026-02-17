import { describe, test, expect, mock, beforeAll, afterEach, afterAll } from 'bun:test';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';
import {
	APIClient,
	UsageError,
	UsageNotFoundError,
	getUsageSummary,
	getUsageBreakdown,
	getUsageTimeseries,
	createDefaultClient,
	UsageSummarySchema,
	UsageBreakdownSchema,
	UsageTimeseriesSchema,
} from '../src/api';
import { resolveProjectId } from '../src/api/usage/util';

// Backup original env
const originalEnv = { ...process.env };
let mockFetchFn: any;

describe('Usage API', () => {
	const summaryResponse = {
		success: true,
		data: {
			projectId: 'proj_test',
			start: '2025-01-01T00:00:00Z',
			end: '2025-02-01T00:00:00Z',
			totalCost: 47.82,
			llmCost: 42.1,
			infraCost: 5.72,
			tokenUsage: {
				promptTokens: 1240000,
				completionTokens: 380000,
				totalTokens: 1620000,
			},
			cpuTimeMs: 284000,
			sessionCount: 1547,
			currency: 'USD',
		},
	};

	const breakdownResponse = {
		success: true,
		data: {
			projectId: 'proj_test',
			groupBy: 'agent',
			groups: [
				{
					key: 'agent_abc',
					label: 'Support Bot',
					totalCost: 32.5,
					llmCost: 30.2,
					infraCost: 2.3,
					promptTokens: 820000,
					completionTokens: 240000,
					sessionCount: 1102,
				},
				{
					key: 'agent_def',
					label: 'Data Processor',
					totalCost: 15.32,
					llmCost: 11.9,
					infraCost: 3.42,
					promptTokens: 420000,
					completionTokens: 140000,
					sessionCount: 445,
				},
			],
		},
	};

	const timeseriesResponse = {
		success: true,
		data: {
			projectId: 'proj_test',
			granularity: 'day',
			metrics: ['totalCost', 'sessionCount'],
			buckets: [
				{ timestamp: '2025-01-01T00:00:00Z', totalCost: 1.23, sessionCount: 42 },
				{ timestamp: '2025-01-02T00:00:00Z', totalCost: 2.45, sessionCount: 87 },
				{ timestamp: '2025-01-03T00:00:00Z', totalCost: 0.89, sessionCount: 31 },
			],
		},
	};

	beforeAll(() => {
		mockFetchFn = mockFetch(async () => {
			return new Response(JSON.stringify({ success: false, message: 'Mock not implemented' }), {
				status: 500,
			});
		});
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		mockFetchFn.mockReset?.();
	});

	describe('Utilities', () => {
		test('resolveProjectId with explicit projectId', () => {
			const projectId = 'proj_test123';
			delete process.env.AGENTUITY_CLOUD_PROJECT_ID;
			const resolved = resolveProjectId(projectId);
			expect(resolved).toBe(projectId);
		});

		test('resolveProjectId from environment', () => {
			process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj_env456';
			const resolved = resolveProjectId();
			expect(resolved).toBe('proj_env456');
		});

		test('resolveProjectId throws when neither available', () => {
			delete process.env.AGENTUITY_CLOUD_PROJECT_ID;
			expect(() => resolveProjectId()).toThrow(UsageError);
		});
	});

	describe('createDefaultClient', () => {
		test('reads AGENTUITY_REGION', () => {
			process.env.AGENTUITY_REGION = 'us-east';
			const client = createDefaultClient();
			expect(client).toBeInstanceOf(APIClient);
		});

		test('throws when AGENTUITY_REGION missing', () => {
			delete process.env.AGENTUITY_REGION;
			expect(() => createDefaultClient()).toThrow();
		});
	});

	describe('Schemas', () => {
		test('UsageSummarySchema validates correctly', () => {
			const result = UsageSummarySchema.safeParse(summaryResponse.data);
			expect(result.success).toBe(true);
		});

		test('UsageBreakdownSchema validates correctly', () => {
			const result = UsageBreakdownSchema.safeParse(breakdownResponse.data);
			expect(result.success).toBe(true);
		});

		test('UsageTimeseriesSchema validates correctly', () => {
			const result = UsageTimeseriesSchema.safeParse(timeseriesResponse.data);
			expect(result.success).toBe(true);
		});
	});

	describe('getUsageSummary', () => {
		test('calls correct URL pattern', async () => {
			// Setup
			process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj_test';
			process.env.AGENTUITY_REGION = 'us-east';
			let urlChecked = false;

			// Mock
			mockFetch(async (url) => {
				if (url.includes('/usage/2025-03-17/proj_test/summary')) {
					urlChecked = true;
				}
				return new Response(JSON.stringify(summaryResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			// Call
			await getUsageSummary({
				start: '2025-01-01T00:00:00Z',
				end: '2025-02-01T00:00:00Z',
			});

			// Assert
			expect(urlChecked).toBe(true);
		});

		test('returns parsed response data', async () => {
			// Setup
			process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj_test';
			process.env.AGENTUITY_REGION = 'us-east';

			// Mock
			mockFetch(async () => {
				return new Response(JSON.stringify(summaryResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			// Call
			const result = await getUsageSummary({
				start: '2025-01-01T00:00:00Z',
				end: '2025-02-01T00:00:00Z',
			});

			// Assert
			expect(result.totalCost).toBe(47.82);
			expect(result.tokenUsage.totalTokens).toBe(1620000);
		});

		test('handles API errors', async () => {
			// Setup
			process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj_test';
			process.env.AGENTUITY_REGION = 'us-east';

			// Mock
			mockFetch(async () => {
				return new Response(
					JSON.stringify({
						success: false,
						message: 'API Error',
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			});

			// Call & Assert - should throw
			let failed = false;
			try {
				await getUsageSummary({
					start: '2025-01-01T00:00:00Z',
					end: '2025-02-01T00:00:00Z',
				});
			} catch (e) {
				failed = true;
			}
			expect(failed).toBe(true);
		});
	});

	describe('getUsageBreakdown', () => {
		test('returns groups array', async () => {
			// Setup
			process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj_test';
			process.env.AGENTUITY_REGION = 'us-east';

			// Mock
			mockFetch(async () => {
				return new Response(JSON.stringify(breakdownResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			// Call
			const result = await getUsageBreakdown({
				start: '2025-01-01T00:00:00Z',
				end: '2025-02-01T00:00:00Z',
				groupBy: 'agent',
			});

			// Assert
			expect(result.groups.length).toBe(2);
			expect(result.groups[0].key).toBe('agent_abc');
			expect(result.groups[1].key).toBe('agent_def');
		});
	});

	describe('getUsageTimeseries', () => {
		test('returns buckets array', async () => {
			// Setup
			process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj_test';
			process.env.AGENTUITY_REGION = 'us-east';

			// Mock
			mockFetch(async () => {
				return new Response(JSON.stringify(timeseriesResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			// Call
			const result = await getUsageTimeseries({
				start: '2025-01-01T00:00:00Z',
				end: '2025-02-01T00:00:00Z',
				granularity: 'day',
				metrics: ['totalCost', 'sessionCount'],
			});

			// Assert
			expect(result.buckets.length).toBe(3);
			expect(result.buckets[0].timestamp).toBe('2025-01-01T00:00:00Z');
			expect(result.buckets[0].totalCost).toBe(1.23);
			expect(result.buckets[0].sessionCount).toBe(42);
		});
	});
});
