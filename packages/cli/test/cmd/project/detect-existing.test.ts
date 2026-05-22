/**
 * Tests for the existing-project detector used by `agentuity project
 * create`.
 *
 * The detector decides whether the create command should offer to
 * import an existing project instead of scaffolding a brand-new one.
 * It runs framework detection plus a couple of direct package.json
 * lookups (Hono, Vite + React) and only reports a hit when the result
 * matches our scaffold catalog.
 *
 * These tests cover:
 *   - the "no package.json" / "unrelated project" miss paths
 *   - one detect-mapped hit (Next.js)
 *   - the two package.json fallback paths (Hono, Vite + React)
 *   - the agentuity.json sidecar flag is reported correctly
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectExistingProject } from '../../../src/cmd/project/detect-existing';

describe('detectExistingProject', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(
			tmpdir(),
			`detect-existing-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('returns null when there is no package.json', async () => {
		const hit = await detectExistingProject(testDir);
		expect(hit).toBeNull();
	});

	test('returns null for a project with no recognized framework or fallback signal', async () => {
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'plain-app',
				scripts: { build: 'tsc -p .' },
				// No framework deps, no hono, no vite — should miss.
				dependencies: { lodash: '^4.0.0' },
			})
		);

		const hit = await detectExistingProject(testDir);
		expect(hit).toBeNull();
	});

	test('detects Next.js via the framework database', async () => {
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'nextapp',
				scripts: { build: 'next build' },
				dependencies: { next: '^15.0.0', react: '^19.0.0' },
			})
		);

		const hit = await detectExistingProject(testDir);
		expect(hit).not.toBeNull();
		expect(hit?.scaffoldSlug).toBe('nextjs');
		expect(hit?.detectedName).toBe('Next.js');
		expect(hit?.hasAgentuityJson).toBe(false);
	});

	test('flags hasAgentuityJson when an agentuity.json sits alongside the project', async () => {
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'nextapp',
				scripts: { build: 'next build' },
				dependencies: { next: '^15.0.0' },
			})
		);
		writeFileSync(join(testDir, 'agentuity.json'), '{}');

		const hit = await detectExistingProject(testDir);
		expect(hit?.hasAgentuityJson).toBe(true);
	});

	test('detects Hono via the package.json fallback (no framework DB entry)', async () => {
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'honoapp',
				scripts: { build: 'tsc' },
				dependencies: { hono: '^4.0.0' },
			})
		);

		const hit = await detectExistingProject(testDir);
		expect(hit?.scaffoldSlug).toBe('hono');
		expect(hit?.detectedName).toBe('Hono');
	});

	test('does not match a vanilla Vite project (no React-on-Bun scaffold anymore)', async () => {
		// We removed the `vite-react` scaffold (Bun.serve proxy to Vite
		// dev only worked in dev). Plain Vite projects fall through to
		// the framework database's generic Vite detector, which doesn't
		// map to a scaffold.
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'vite-react-app',
				scripts: { build: 'vite build' },
				dependencies: { react: '^19.0.0', vite: '^6.0.0' },
			})
		);

		const hit = await detectExistingProject(testDir);
		expect(hit).toBeNull();
	});
});
