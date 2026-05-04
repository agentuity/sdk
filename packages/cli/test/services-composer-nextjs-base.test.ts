/**
 * End-to-end check: applying the composer to the *real* bundled Next.js
 * base template (with no services selected) must produce a clean,
 * marker-free output that survives a JSON parse / TS sanity check.
 *
 * This catches mistakes in the actual templates/nextjs/manifest.json
 * and the real marker placements in src/lib/translate.ts and
 * src/app/page.tsx \u2014 things our synthetic-fixture composer tests
 * don't cover.
 */

import { createMockLogger } from '@agentuity/test-utils';
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeServices } from '../src/cmd/project/services-composer';

const cleanup: string[] = [];

afterEach(async () => {
	while (cleanup.length > 0) {
		const dir = cleanup.pop();
		if (dir) await rm(dir, { recursive: true, force: true });
	}
});

describe('Next.js base composition (no services)', () => {
	test('strips all markers and leaves the helper + page well-formed', async () => {
		const templatesRoot = join(__dirname, '..', 'src', 'cmd', 'project', 'templates');
		const nextjsBase = join(templatesRoot, 'nextjs');

		const dest = await mkdtemp(join(tmpdir(), 'nextjs-base-'));
		cleanup.push(dest);

		// Mirror what scaffold.ts does for the AI-example overlay: a
		// recursive copy of the template directory into the destination.
		// The composer then runs against the destination tree, just like
		// the real flow.
		await cp(nextjsBase, dest, { recursive: true });

		await composeServices({
			dest,
			framework: 'nextjs',
			selectedServices: [],
			templatesRoot,
			logger: createMockLogger(),
		});

		const translateOut = await readFile(join(dest, 'src/lib/translate.ts'), 'utf8');
		const pageOut = await readFile(join(dest, 'src/app/page.tsx'), 'utf8');

		// No marker comments anywhere in either file. We check for the
		// `@agentuity:` substring rather than the comment forms because
		// finding it at all would mean composition leaked a marker.
		expect(translateOut).not.toContain('@agentuity:');
		expect(pageOut).not.toContain('@agentuity:');

		// translate.ts is plain TypeScript and has no Next-isms or JSX, so
		// JSON.parse won't help, but a basic sanity check: it still has
		// the exports we expect, and isn't empty.
		expect(translateOut).toContain('export interface TranslateInput');
		expect(translateOut).toContain('export interface TranslateResult');
		expect(translateOut).toContain('export async function translate');

		// page.tsx still has its 'use client' directive, the Home export,
		// and the result block. We're not full-typechecking here; we're
		// confirming the marker-strip didn't eat any real code.
		expect(pageOut.startsWith("'use client';")).toBe(true);
		expect(pageOut).toContain('export default function Home()');
		expect(pageOut).toContain('Translation will appear here');
	});
});
