import { expect, test } from 'bun:test';
import { processDoc } from '../docs-processor';

test('processDoc returns vector documents for service-managed embedding', async () => {
	const vectors = await processDoc(`---
title: Quickstart
description: Create an Agentuity app
---

# Quickstart

Run \`agentuity create\` to create an app.
`);

	expect(vectors.length).toBeGreaterThan(0);
	const [first] = vectors;
	if (!first) {
		throw new Error('Expected at least one vector document');
	}

	expect(first.key).toBeTypeOf('string');
	expect('document' in first).toBe(true);
	expect('embeddings' in first).toBe(false);
	expect(first.metadata?.title).toBe('Quickstart');
	expect(first.metadata?.description).toBe('Create an Agentuity app');
	expect(first.metadata?.text).toContain('agentuity create');
});
