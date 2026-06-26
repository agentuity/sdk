import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDocsCdnTransformAssets } from './cdn-assets';

describe('docs CDN asset transform', () => {
	test('uses the platform CDN origin when it is injected', () => {
		expect(
			createDocsCdnTransformAssets({
				AGENTUITY_CDN_ORIGIN: 'https://cdn.agentuity.com/deploy_123/',
				AGENTUITY_CLOUD_DEPLOYMENT_ID: 'deploy_fallback',
			})
		).toEqual({
			prefix: 'https://cdn.agentuity.com/deploy_123',
			crossOrigin: 'anonymous',
		});
	});

	test('falls back to the deployment CDN origin', () => {
		expect(
			createDocsCdnTransformAssets({
				AGENTUITY_CLOUD_DEPLOYMENT_ID: 'deploy_fallback',
			})
		).toEqual({
			prefix: 'https://cdn.agentuity.com/deploy_fallback',
			crossOrigin: 'anonymous',
		});
	});

	test('strips a trailing slash from the deployment id to avoid a double slash', () => {
		expect(
			createDocsCdnTransformAssets({
				AGENTUITY_CLOUD_DEPLOYMENT_ID: 'deploy_fallback/',
			})
		).toEqual({
			prefix: 'https://cdn.agentuity.com/deploy_fallback',
			crossOrigin: 'anonymous',
		});
	});

	test('leaves local asset URLs unchanged when deployment env is absent', () => {
		expect(createDocsCdnTransformAssets({})).toBeUndefined();
	});

	test('keeps the global stylesheet in the TanStack asset manifest', () => {
		const rootRouteSource = readFileSync(join(import.meta.dir, 'routes/__root.tsx'), 'utf-8');

		expect(rootRouteSource).toMatch(/import\s+['"]\.\.\/index\.css['"]/);
		expect(rootRouteSource).not.toContain('index.css?url');
		expect(rootRouteSource).not.toContain('href: appCss');
	});
});
