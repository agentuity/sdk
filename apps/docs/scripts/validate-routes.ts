/**
 * Validate and generate TanStack Router route files for MDX content pages.
 *
 * Each .mdx page in src/web/content/ needs a .tsx route file in
 * src/web/routes/_docs/ to be accessible. Without the route file, the page
 * shows "Not Found" at runtime even though the build passes.
 *
 * By default, generates missing route files automatically. Use --check to
 * validate without generating (exits non-zero if any are missing).
 *
 * Run: bun run scripts/validate-routes.ts [--check]
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { Glob } from 'bun';
import matter from 'gray-matter';

const docsRoot = join(import.meta.dir, '..');
const contentDir = join(docsRoot, 'src/web/content');
const routesDir = join(docsRoot, 'src/web/routes/_docs');

const checkOnly = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the relative import path from a route file to the MDXPage component. */
function mdxPageImport(routeFilePath: string): string {
	const routeFileDir = dirname(routeFilePath);
	const componentsDir = join(docsRoot, 'src/web/components/docs/mdx-page');
	const rel = relative(routeFileDir, componentsDir);
	// relative() gives something like "../../../components/docs/mdx-page"
	return rel.startsWith('.') ? rel : `./${rel}`;
}

/** Convert a slug like "calling-agents" to title case: "Calling Agents". */
function slugToTitle(slug: string): string {
	return slug
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Read the frontmatter title (short_title preferred) from an MDX file. */
async function getCrumb(mdxPath: string): Promise<string> {
	try {
		const content = await readFile(join(contentDir, mdxPath), 'utf-8');
		const { data } = matter(content);
		return (
			data.short_title ||
			data.title ||
			slugToTitle(
				mdxPath
					.replace(/\.mdx$/, '')
					.split('/')
					.pop()!
			)
		);
	} catch {
		return slugToTitle(
			mdxPath
				.replace(/\.mdx$/, '')
				.split('/')
				.pop()!
		);
	}
}

/** Generate the content for a route .tsx file. */
function generateRouteFile(
	routePath: string,
	contentRoute: string,
	crumb: string,
	importPath: string
): string {
	return `import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '${importPath}';

export const Route = createFileRoute('/_docs/${routePath}')({
\tcomponent: () => <MDXPage route="${contentRoute}" />,
\tstaticData: { crumb: '${crumb.replace(/'/g, "\\'")}' },
});
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const contentGlob = new Glob('**/*.mdx');
const missing: { mdxPath: string; routeFile: string; routePath: string; contentRoute: string }[] =
	[];
let checked = 0;

for await (const mdxPath of contentGlob.scan(contentDir)) {
	let routeFile: string;
	let routePath: string;
	let contentRoute: string;

	if (mdxPath.endsWith('/index.mdx') || mdxPath === 'index.mdx') {
		// Index pages: agents/index.mdx → routes/_docs/agents/index.tsx
		const dir = mdxPath.replace(/\/?index\.mdx$/, '');
		if (!dir) {
			// Root index.mdx - skip, handled by the docs layout route
			checked++;
			continue;
		}
		routeFile = join(routesDir, dir, 'index.tsx');
		routePath = `${dir}/`;
		contentRoute = dir;
	} else {
		// Content pages: agents/creating-agents.mdx → routes/_docs/agents/creating-agents.tsx
		const withoutExt = mdxPath.replace(/\.mdx$/, '');
		routeFile = join(routesDir, `${withoutExt}.tsx`);
		routePath = withoutExt;
		contentRoute = withoutExt;
	}

	if (!(await Bun.file(routeFile).exists())) {
		missing.push({ mdxPath, routeFile, routePath, contentRoute });
	}
	checked++;
}

if (missing.length === 0) {
	console.log(`  All ${checked} content pages have route files.`);
	process.exit(0);
}

if (checkOnly) {
	console.error(`\n  Missing route files for ${missing.length} page(s):\n`);
	for (const m of missing) {
		const relRoute = relative(docsRoot, m.routeFile);
		console.error(`    ${m.mdxPath}`);
		console.error(`    -> needs: ${relRoute}\n`);
	}
	console.error(`  ${checked} pages checked, ${missing.length} missing routes.\n`);
	process.exit(1);
}

// Generate missing route files
let generated = 0;
for (const m of missing) {
	const crumb = await getCrumb(m.mdxPath);
	const importPath = mdxPageImport(m.routeFile);
	const content = generateRouteFile(m.routePath, m.contentRoute, crumb, importPath);

	await mkdir(dirname(m.routeFile), { recursive: true });
	await writeFile(m.routeFile, content);
	generated++;

	const relRoute = relative(docsRoot, m.routeFile);
	console.log(`  Generated: ${relRoute}`);
}

console.log(`\n  ${checked} pages checked, ${generated} route files generated.`);
