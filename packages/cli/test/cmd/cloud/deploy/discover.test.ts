/**
 * Tests for the deploy "Detect Project" (discover) phase.
 *
 * The phase has two entry points:
 *   - `runDiscover()` for non-step callers (throws on failure, returns
 *     `DiscoverResult` on success).
 *   - `buildDiscoverStep()` for callers running inside `runSteps()` (returns
 *     a `Step` whose `run()` resolves to a `StepOutcome` and mutates
 *     `state.discover` on success).
 *
 * Both share the same validation rules, so we exercise them together to
 * make sure they stay consistent.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Logger } from '@agentuity/core';
import { buildDiscoverStep, runDiscover } from '../../../../src/cmd/cloud/deploy/discover';
import type { DiscoverResult } from '../../../../src/cmd/cloud/deploy/types';

// Minimal Logger stub. The real Logger has many methods but discover only
// uses `debug`, so we provide noop versions of everything callers rely on.
function makeLogger(): Logger {
	const noop = () => {};
	return {
		trace: noop,
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		fatal: noop,
		child: () => makeLogger(),
	} as unknown as Logger;
}

describe('deploy discover phase', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(
			tmpdir(),
			`discover-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe('runDiscover', () => {
		test('throws a clear error when there is no package.json', async () => {
			await expect(runDiscover(testDir, makeLogger())).rejects.toThrow(/No package\.json/);
		});

		test('throws a clear error when no framework can be detected and no build script', async () => {
			// package.json without name, dependencies, or build script — the
			// generic detector returns null in this case.
			writeFileSync(join(testDir, 'package.json'), JSON.stringify({ private: true }));

			await expect(runDiscover(testDir, makeLogger())).rejects.toThrow();
		});

		test('returns DiscoverResult for a Next.js project', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-next-app',
					scripts: {
						build: 'next build',
					},
					dependencies: {
						next: '^15.0.0',
						react: '^19.0.0',
					},
				})
			);

			const result = await runDiscover(testDir, makeLogger());
			expect(result.framework.name).toBe('nextjs');
			expect(result.framework.runtime).toBeTruthy();
			expect(result.framework.buildCommand).toContain('build');
			expect(result.packageJson?.name).toBe('test-next-app');
		});

		test('returns DiscoverResult for a generic project with a build script', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'plain-app',
					scripts: {
						build: 'tsc -p .',
					},
				})
			);

			const result = await runDiscover(testDir, makeLogger());
			// Generic detector resolves the framework from the project's `build`
			// script. The exact command is whatever the user wrote (`tsc -p .`
			// here) — we just need a non-empty string and the parsed package.json
			// back so the build phase can hand both off to the adapter.
			expect(result.framework.buildCommand).toBeTruthy();
			expect(result.packageJson?.name).toBe('plain-app');
		});
	});

	describe('buildDiscoverStep', () => {
		test('returns an error outcome when no package.json is present', async () => {
			const state: { discover?: DiscoverResult } = {};
			const step = buildDiscoverStep(testDir, makeLogger(), state);
			expect(step.label).toBe('Detect Project');

			const outcome = await step.run({
				progress: () => {},
				signal: new AbortController().signal,
			});

			expect(outcome.status).toBe('error');
			expect(state.discover).toBeUndefined();
		});

		test('populates state.discover and returns success for a Next.js project', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-next-app',
					scripts: { build: 'next build' },
					dependencies: { next: '^15.0.0' },
				})
			);

			const state: { discover?: DiscoverResult } = {};
			const step = buildDiscoverStep(testDir, makeLogger(), state);
			const outcome = await step.run({
				progress: () => {},
				signal: new AbortController().signal,
			});

			expect(outcome.status).toBe('success');
			expect(state.discover).toBeDefined();
			expect(state.discover?.framework.name).toBe('nextjs');
			expect(state.discover?.packageJson.name).toBe('test-next-app');

			// Success outputs include a small project summary that's surfaced
			// to the user; it should at least mention the framework.
			if (outcome.status === 'success' && outcome.output) {
				const text = outcome.output.join('\n');
				expect(text).toContain('Framework');
				expect(text).toContain('nextjs');
			}
		});

		test('returns an error outcome and leaves state untouched on detection failure', async () => {
			writeFileSync(join(testDir, 'package.json'), JSON.stringify({ private: true }));

			const state: { discover?: DiscoverResult } = {};
			const step = buildDiscoverStep(testDir, makeLogger(), state);
			const outcome = await step.run({
				progress: () => {},
				signal: new AbortController().signal,
			});

			expect(outcome.status).toBe('error');
			expect(state.discover).toBeUndefined();
		});
	});
});
