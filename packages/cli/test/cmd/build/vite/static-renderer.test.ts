import { describe, test, expect } from 'bun:test';
import {
	extractRoutePaths,
	type RouteTreeNode,
} from '../../../../src/cmd/build/vite/static-renderer';

/**
 * Unit tests for the TanStack Router route-tree walker used by the static
 * renderer. The walker decides which URLs to pre-render into
 * `.agentuity/client/<route>/index.html` files at build time, so any route it
 * misses ships with Vite's raw template (and a visible <!--app-html-->
 * placeholder in production).
 *
 * We construct minimal trees that mirror the shape TanStack's code-generator
 * produces in `routeTree.gen.ts` — parent/child via `children`, path segments
 * via `path`, layout routes with no path.
 */

/**
 * Create a node in the shape `routeTree.gen.ts` produces after
 * `._addFileChildren({...})`: a `children` record keyed by arbitrary names.
 */
function node(
	path: string | undefined,
	children: Record<string, RouteTreeNode> = {}
): RouteTreeNode {
	const n: RouteTreeNode = { children };
	if (path !== undefined) n.path = path;
	return n;
}

describe('extractRoutePaths', () => {
	test('emits `/` for an index route directly under the pathless root', () => {
		// Mirrors the docs app: `createFileRoute('/')` as a child of the root
		// layout. Before the fix this emitted nothing, so the landing page
		// was never SSR'd and shipped with the unreplaced placeholder.
		const tree = node(undefined, {
			IndexRoute: node('/'),
		});

		expect(extractRoutePaths(tree)).toEqual(['/']);
	});

	test('emits child paths under a pathless layout route', () => {
		// The docs app wraps almost everything in a `/_docs` layout that has
		// no URL of its own. Children like `/get-started/` must still surface
		// at `/get-started` in the output set.
		const tree = node(undefined, {
			DocsRoute: node(undefined, {
				GetStartedIndex: node('/get-started/'),
				QuickstartRoute: node('/get-started/quickstart'),
			}),
		});

		expect(extractRoutePaths(tree)).toEqual(['/get-started', '/get-started/quickstart']);
	});

	test('emits the parent path for an index route under a non-root layout', () => {
		// `DocsReferenceIndexRoute` with path `/` under a `/reference` parent
		// should pre-render `/reference`, not be dropped.
		const tree = node(undefined, {
			Reference: node('/reference', {
				ReferenceIndex: node('/'),
				ApiIndex: node('/api'),
			}),
		});

		expect(extractRoutePaths(tree)).toEqual(['/reference', '/reference/api']);
	});

	test('strips trailing slashes so index and leaf routes dedupe', () => {
		// TanStack emits both `path: '/explorer/'` (index under root) and
		// `path: '/explorer'` variants in different generator versions. Both
		// must normalize to `/explorer` and dedupe.
		const tree = node(undefined, {
			ExplorerIndex: node('/explorer/'),
			ExplorerLeaf: node('/explorer'),
		});

		expect(extractRoutePaths(tree)).toEqual(['/explorer']);
	});

	test('skips parameterized routes (TanStack $-prefix) but keeps siblings', () => {
		// Pre-rendering cannot enumerate dynamic segments; callers are
		// expected to supply those via `getStaticPaths()`.
		const tree = node(undefined, {
			IndexRoute: node('/'),
			DynamicRoute: node('/posts/$id'),
			StaticRoute: node('/about'),
		});

		expect(extractRoutePaths(tree)).toEqual(['/', '/about']);
	});

	test('returns a sorted, deduplicated list', () => {
		// Order matters for deterministic builds / snapshot tests; duplicates
		// would waste SSR work and overwrite files.
		const tree = node(undefined, {
			Z: node('/zzz'),
			A: node('/aaa'),
			ADup: node('/aaa/'),
			M: node('/mmm'),
		});

		expect(extractRoutePaths(tree)).toEqual(['/aaa', '/mmm', '/zzz']);
	});

	test('reads `path` from `options.path` as a fallback (v1-style nodes)', () => {
		// The walker supports both shapes because older TanStack generators
		// nest the metadata under `options`. Losing this compatibility would
		// silently drop every route in those trees.
		const tree: RouteTreeNode = {
			options: { path: undefined },
			children: {
				Legacy: { options: { path: '/legacy' } },
				LegacyIndex: { options: { path: '/' } },
			},
		};

		expect(extractRoutePaths(tree)).toEqual(['/', '/legacy']);
	});

	test('handles the docs-app top-level shape end to end', () => {
		// Abbreviated version of apps/docs/src/web/routeTree.gen.ts: a
		// pathless root with a `/` index and a `/_docs` layout holding
		// several section indexes. Regression test for the original bug
		// where only the nested sections (get-started, cookbook, ...)
		// rendered and the landing page did not.
		const tree = node(undefined, {
			IndexRoute: node('/'),
			DocsRoute: node(undefined, {
				GetStartedIndex: node('/get-started/'),
				CookbookIndex: node('/cookbook/'),
				ReferenceIndex: node('/reference/'),
			}),
			ExplorerIndex: node('/explorer/'),
		});

		expect(extractRoutePaths(tree)).toEqual([
			'/',
			'/cookbook',
			'/explorer',
			'/get-started',
			'/reference',
		]);
	});
});
