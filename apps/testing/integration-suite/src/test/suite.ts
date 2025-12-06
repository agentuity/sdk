/**
 * Test suite registry and definitions
 */

export interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
	stack?: string;
	duration: number;
}

export interface TestFunction {
	(): Promise<void> | void;
}

export interface TestDefinition {
	name: string;
	suite: string;
	fn: TestFunction;
}

export class TestSuite {
	private tests: Map<string, TestDefinition> = new Map();

	/**
	 * Register a test
	 */
	register(suite: string, name: string, fn: TestFunction): void {
		const key = `${suite}:${name}`;
		this.tests.set(key, { name, suite, fn });
	}

	/**
	 * Get all tests, optionally filtered by suite and/or name
	 */
	getTests(suite?: string, name?: string): TestDefinition[] {
		let tests = Array.from(this.tests.values());

		if (suite) {
			tests = tests.filter((t) => t.suite === suite);
		}

		if (name) {
			tests = tests.filter((t) => t.name === name);
		}

		return tests;
	}

	/**
	 * Get all suite names
	 */
	getSuites(): string[] {
		const suites = new Set<string>();
		for (const test of this.tests.values()) {
			suites.add(test.suite);
		}
		return Array.from(suites);
	}

	/**
	 * Run a single test and return the result
	 */
	async runTest(test: TestDefinition): Promise<TestResult> {
		const startTime = performance.now();
		try {
			await test.fn();
			const duration = performance.now() - startTime;
			return {
				name: `${test.suite}:${test.name}`,
				passed: true,
				duration,
			};
		} catch (error) {
			const duration = performance.now() - startTime;
			return {
				name: `${test.suite}:${test.name}`,
				passed: false,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				duration,
			};
		}
	}

	/**
	 * Run all tests matching the filter criteria
	 */
	async runAll(
		suite?: string,
		name?: string,
		concurrency = 10
	): Promise<{ results: TestResult[]; summary: TestSummary }> {
		const tests = this.getTests(suite, name);

		// Run tests in batches to limit concurrency
		const results: TestResult[] = [];
		for (let i = 0; i < tests.length; i += concurrency) {
			const batch = tests.slice(i, i + concurrency);
			const batchResults = await Promise.allSettled(batch.map((t) => this.runTest(t)));

			// Extract results from settled promises
			for (const result of batchResults) {
				if (result.status === 'fulfilled') {
					results.push(result.value);
				} else {
					// This shouldn't happen since runTest catches all errors,
					// but handle it just in case
					results.push({
						name: 'unknown',
						passed: false,
						error: String(result.reason),
						duration: 0,
					});
				}
			}
		}

		const summary = this.summarize(results);
		return { results, summary };
	}

	/**
	 * Create a summary of test results
	 */
	private summarize(results: TestResult[]): TestSummary {
		const passed = results.filter((r) => r.passed).length;
		const failed = results.filter((r) => !r.passed).length;
		const total = results.length;
		const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

		return {
			total,
			passed,
			failed,
			duration: totalDuration,
		};
	}
}

export interface TestSummary {
	total: number;
	passed: number;
	failed: number;
	duration: number;
}

// Global test suite instance
export const testSuite = new TestSuite();

/**
 * Register a test (convenience function)
 */
export function test(suite: string, name: string, fn: TestFunction): void {
	testSuite.register(suite, name, fn);
}
