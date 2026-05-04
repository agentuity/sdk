/**
 * Service augment composer.
 *
 * Applies a selection of service augments to a scaffolded project:
 *
 *  1. Copies whole files owned by the service into the project tree.
 *  2. Splices snippet contributions into composable base files at named
 *     comment markers.
 *  3. Merges package.json (deps, devDeps, scripts) and .env.example.
 *
 * The composer is pure text. Markers are single-line comments like
 * `// @agentuity:translate-pre`; whatever syntax the framework manifest
 * declares for a given marker is what the composer looks for. Snippets
 * are authored at zero indent and re-indented to match the marker line's
 * leading whitespace at splice time.
 *
 * Service order is fixed by the catalog (see services-catalog.ts).
 * `composeServices` will internally re-sort the requested selection so
 * the output is deterministic regardless of how the caller picked.
 */

import { existsSync, readFileSync } from 'node:fs';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@agentuity/core';
import { currentDir } from '../../node-compat/runtime-info.ts';
import {
	type FrameworkId,
	type ServiceAugment,
	loadCatalog,
	resolveSelection,
} from './services-catalog.ts';

/** Comment syntax used to delimit a marker. */
type MarkerSyntax = '//' | '{/* */}' | '<!-- -->';

interface MarkerSpec {
	syntax: MarkerSyntax;
}

interface ComposableFile {
	path: string;
	markers: Record<string, MarkerSpec>;
}

interface FrameworkManifest {
	framework: FrameworkId;
	displayName: string;
	composableFiles: Record<string, ComposableFile>;
}

export interface ComposeOptions {
	/** Absolute path to the scaffolded project. */
	dest: string;
	/** Framework slug; matches a directory under templates/. Unknown
	 * slugs are treated as "no manifest" and the composer is a no-op for
	 * them, which lets template-flow call composeServices unconditionally
	 * during the rollout to all frameworks. */
	framework: string;
	/** Selected service ids (will be expanded with `requires` and reordered). */
	selectedServices: string[];
	logger: Logger;
	/**
	 * Override the templates root directory. Tests use this to point the
	 * composer at a synthetic templates tree. Production callers leave it
	 * unset; the composer resolves the bundled templates dir.
	 */
	templatesRoot?: string;
}

/**
 * Apply selected service augments to the project at `dest`.
 *
 * Idempotent in the file-copy step (rerunning overwrites with the same
 * content) but NOT in the marker-splice step — the markers get stripped
 * after composition, so a second run finds nothing to splice. Don't run
 * twice.
 */
export async function composeServices(opts: ComposeOptions): Promise<void> {
	const { dest, framework, selectedServices, logger } = opts;
	const templatesRoot = opts.templatesRoot ?? defaultTemplatesRoot();

	const catalog = loadCatalog(servicesRoot(templatesRoot));
	const services = resolveSelection(selectedServices, catalog);
	if (services.length === 0) {
		// No services selected — still strip marker lines from composable
		// files so the output reads cleanly. We treat this as "compose
		// with zero contributions".
		logger.debug('No services selected; stripping markers only.');
	} else {
		logger.debug(`Composing services: ${services.map((s) => s.id).join(', ')}`);
	}

	const frameworkManifest = loadFrameworkManifest(templatesRoot, framework);
	if (!frameworkManifest) {
		if (services.length > 0) {
			throw new Error(
				`Framework '${framework}' does not yet support service augments. ` +
					`Pass an empty service selection or pick a supported framework.`
			);
		}
		logger.debug(`Framework '${framework}' has no manifest; composer is a no-op.`);
		return;
	}

	// 1. Whole-file additions per service.
	for (const service of services) {
		await copyServiceFiles(templatesRoot, service, framework, dest, logger);
	}

	// 2. Marker splicing on each composable file declared by the framework.
	for (const handle of Object.keys(frameworkManifest.composableFiles)) {
		const file = frameworkManifest.composableFiles[handle]!;
		await spliceComposableFile(templatesRoot, handle, file, services, framework, dest);
	}

	// 3. Package.json + .env.example merges.
	await mergePackageJson(dest, services);
	await mergeEnvExample(dest, services);
}

// ---- Internals ----

function defaultTemplatesRoot(): string {
	return join(currentDir(import.meta), 'templates');
}

function frameworkDir(templatesRoot: string, framework: string): string {
	return join(templatesRoot, framework);
}

function servicesRoot(templatesRoot: string): string {
	return join(templatesRoot, 'services');
}

function loadFrameworkManifest(templatesRoot: string, framework: string): FrameworkManifest | null {
	const path = join(frameworkDir(templatesRoot, framework), 'manifest.json');
	if (!existsSync(path)) {
		// Framework hasn't been refactored for service composition yet —
		// composer is a no-op for it. Returns null instead of throwing so
		// `composeServices` can gracefully skip while we roll out support
		// to remaining frameworks.
		return null;
	}
	const raw = readFileSync(path, 'utf8');
	const parsed = JSON.parse(raw) as FrameworkManifest;
	if (parsed.framework !== framework) {
		throw new Error(
			`Framework manifest at ${path} declares framework='${parsed.framework}' but expected '${framework}'`
		);
	}
	return parsed;
}

async function copyServiceFiles(
	templatesRoot: string,
	service: ServiceAugment,
	framework: string,
	dest: string,
	logger: Logger
): Promise<void> {
	const filesDir = join(servicesRoot(templatesRoot), service.id, 'files', framework);
	if (!existsSync(filesDir)) return; // Service may not target this framework, or has no whole files.

	logger.debug(`Copying files for service '${service.id}' from ${filesDir}`);
	await cp(filesDir, dest, { recursive: true, force: true, dereference: true });
}

async function spliceComposableFile(
	templatesRoot: string,
	handle: string,
	file: ComposableFile,
	services: ServiceAugment[],
	framework: string,
	dest: string
): Promise<void> {
	const fullPath = join(dest, file.path);
	if (!existsSync(fullPath)) {
		throw new Error(
			`Composable file '${handle}' (${file.path}) declared in framework manifest is missing in ${dest}`
		);
	}

	let source = await readFile(fullPath, 'utf8');

	for (const [markerName, spec] of Object.entries(file.markers)) {
		const snippets = await collectSnippetsForMarker(
			templatesRoot,
			services,
			framework,
			handle,
			markerName,
			file.path
		);
		source = spliceMarker(source, markerName, spec.syntax, snippets, file.path);
	}

	source = collapseExtraBlankLines(source);

	await writeFile(fullPath, source);
}

/**
 * Collapse runs of 3+ blank lines down to a single blank line.
 *
 * Stripping a marker on its own line in source that already had blank
 * lines around it can leave 3 or 4 consecutive newlines. Hand-written
 * code rarely has more than one blank line in a row; we normalize here
 * so composed output looks natural without requiring a follow-up
 * formatter pass.
 */
function collapseExtraBlankLines(source: string): string {
	return source.replace(/\n{3,}/g, '\n\n');
}

async function collectSnippetsForMarker(
	templatesRoot: string,
	services: ServiceAugment[],
	framework: string,
	fileHandle: string,
	markerName: string,
	composableFilePath: string
): Promise<string[]> {
	const ext = extensionOf(composableFilePath);
	const fragments: string[] = [];

	for (const service of services) {
		const snippetDir = join(servicesRoot(templatesRoot), service.id, 'snippets', framework);
		if (!existsSync(snippetDir)) continue;

		// Snippet filename: <handle>.<marker>.<ext>
		const snippetPath = join(snippetDir, `${fileHandle}.${markerName}${ext}`);
		if (!existsSync(snippetPath)) continue;

		const body = (await readFile(snippetPath, 'utf8')).replace(/\n+$/, '');
		if (body.length === 0) continue;
		fragments.push(body);
	}

	return fragments;
}

/**
 * Find the marker line for `markerName` using `syntax`, replace it
 * with the concatenated `snippets` (re-indented to match the marker's
 * own leading whitespace), and return the new source.
 *
 * If the marker is not found, throws — a marker named in the framework
 * manifest must exist in the file.
 *
 * If `snippets` is empty, the marker line is simply removed (its
 * surrounding blank lines, if any, are preserved as-is).
 */
function spliceMarker(
	source: string,
	markerName: string,
	syntax: MarkerSyntax,
	snippets: string[],
	debugPath: string
): string {
	const pattern = markerLinePattern(markerName, syntax);
	const match = source.match(pattern);
	if (!match) {
		throw new Error(
			`Marker '@agentuity:${markerName}' (syntax ${syntax}) not found in ${debugPath}`
		);
	}

	const leadingNewline = match[1] ?? '';
	const leadingWs = match[2] ?? '';

	let replacement: string;
	if (snippets.length === 0) {
		// Drop the marker line entirely. Keep the leading newline so the
		// previous line stays on its own line; drop the trailing newline
		// because the marker line itself disappears completely.
		replacement = leadingNewline;
	} else {
		const reindented = snippets.map((s) => indentBlock(s, leadingWs)).join('\n\n');
		replacement = `${leadingNewline}${reindented}\n`;
	}

	return source.replace(pattern, replacement);
}

/**
 * Build a regex matching the marker line plus its trailing newline.
 * Captures the line's leading whitespace in group 1 so callers can
 * re-indent snippets to match.
 *
 * The regex is anchored to a line boundary on both ends; markers must
 * sit on their own line.
 */
function markerLinePattern(markerName: string, syntax: MarkerSyntax): RegExp {
	const escapedName = markerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Inside the marker body we deliberately use `[ \t]*` (horizontal
	// whitespace only) rather than `\s*` so we don't accidentally eat
	// trailing newlines and collapse blank lines around the marker.
	let body: string;
	switch (syntax) {
		case '//':
			body = `\\/\\/[ \\t]*@agentuity:${escapedName}`;
			break;
		case '{/* */}':
			body = `\\{[ \\t]*\\/\\*[ \\t]*@agentuity:${escapedName}[ \\t]*\\*\\/[ \\t]*\\}`;
			break;
		case '<!-- -->':
			body = `<!--[ \\t]*@agentuity:${escapedName}[ \\t]*-->`;
			break;
	}
	return new RegExp(`(^|\\n)([ \\t]*)${body}[ \\t]*(\\r?\\n|$)`);
}

/**
 * Re-indent each line of `block` by prepending `indent`. Empty lines
 * stay empty (no trailing-whitespace pollution).
 */
function indentBlock(block: string, indent: string): string {
	if (indent.length === 0) return block;
	return block
		.split('\n')
		.map((line) => (line.length === 0 ? line : indent + line))
		.join('\n');
}

function extensionOf(path: string): string {
	const idx = path.lastIndexOf('.');
	return idx === -1 ? '' : path.slice(idx);
}

async function mergePackageJson(dest: string, services: ServiceAugment[]): Promise<void> {
	if (services.length === 0) return;
	const path = join(dest, 'package.json');
	if (!existsSync(path)) {
		throw new Error(`package.json not found at ${path}`);
	}
	const pkg = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

	pkg.dependencies ??= {};
	pkg.devDependencies ??= {};
	pkg.scripts ??= {};

	const deps = pkg.dependencies as Record<string, string>;
	const devDeps = pkg.devDependencies as Record<string, string>;
	const scripts = pkg.scripts as Record<string, string>;

	for (const service of services) {
		for (const p of service.packages) {
			deps[p] ??= 'latest';
		}
		for (const p of service.devPackages ?? []) {
			devDeps[p] ??= 'latest';
		}
		for (const [name, cmd] of Object.entries(service.scripts ?? {})) {
			scripts[name] = cmd; // services may overwrite, by intent
		}
	}

	await writeFile(path, JSON.stringify(pkg, null, '\t') + '\n');
}

async function mergeEnvExample(dest: string, services: ServiceAugment[]): Promise<void> {
	const additions = services.flatMap((s) => s.envVars ?? []).map((v) => formatEnvLine(v));
	if (additions.length === 0) return;

	const path = join(dest, '.env.example');
	let existing = '';
	try {
		existing = await readFile(path, 'utf8');
	} catch {
		// File doesn't exist yet — that's fine, we'll create it.
	}

	const existingNames = new Set(
		existing
			.split('\n')
			.map((l) => l.match(/^([A-Z_][A-Z0-9_]*)\s*=/)?.[1])
			.filter((x): x is string => Boolean(x))
	);

	const novel: string[] = [];
	for (const service of services) {
		for (const v of service.envVars ?? []) {
			if (existingNames.has(v.name)) continue;
			existingNames.add(v.name);
			novel.push(formatEnvLine(v));
		}
	}
	if (novel.length === 0) return;

	const trimmed = existing.trimEnd();
	const sep = trimmed.length > 0 ? '\n\n' : '';
	const next = `${trimmed}${sep}${novel.join('\n')}\n`;
	await writeFile(path, next);
}

function formatEnvLine(v: { name: string; placeholder: string; comment?: string }): string {
	const commentLine = v.comment ? `# ${v.comment}\n` : '';
	return `${commentLine}${v.name}=${v.placeholder}`;
}
