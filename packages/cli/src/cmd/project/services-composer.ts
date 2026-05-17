/**
 * Service augment composer.
 *
 * Applies a selection of service augments to a scaffolded project:
 *
 *  1. Copies whole files owned by the service into the project tree.
 *  2. Merges package.json (deps, devDeps, scripts) and .env.example.
 *  3. Injects a services checklist into the landing page.
 *
 * The checklist marker `@agentuity:services-checklist` is a single
 * line in the framework's page template. When services are selected,
 * the marker is replaced with a styled checklist showing which
 * services were set up. When no services are selected, the marker
 * line is simply removed.
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
import { getVersion } from '../../version.ts';
import {
	type FrameworkId,
	type ServiceAugment,
	loadCatalog,
	resolveSelection,
} from './services-catalog.ts';

/** Comment syntax used to delimit the checklist marker. */
type MarkerSyntax = '//' | '{/* */}' | '<!-- -->';

interface ChecklistFile {
	path: string;
	syntax: MarkerSyntax;
}

interface FrameworkManifest {
	framework: FrameworkId;
	displayName: string;
	checklistFile: ChecklistFile;
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
 * content) but NOT in the checklist-injection step — the marker gets
 * stripped after composition, so a second run finds nothing to inject.
 * Don't run twice.
 */
export async function composeServices(opts: ComposeOptions): Promise<void> {
	const { dest, framework, selectedServices, logger } = opts;
	const templatesRoot = opts.templatesRoot ?? defaultTemplatesRoot();

	const catalog = loadCatalog(servicesRoot(templatesRoot));
	const services = resolveSelection(selectedServices, catalog);
	if (services.length === 0) {
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

	// 2. Inject services checklist into the landing page.
	await injectChecklist(dest, frameworkManifest, services);

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
	if (!existsSync(filesDir)) return;

	logger.debug(`Copying files for service '${service.id}' from ${filesDir}`);
	await cp(filesDir, dest, { recursive: true, force: true, dereference: true });
}

/**
 * Inject the services checklist into the page file declared in the
 * framework manifest.
 *
 * When services are selected, the `@agentuity:services-checklist` marker
 * is replaced with a styled checklist section. When no services are
 * selected, the marker is simply removed.
 */
async function injectChecklist(
	dest: string,
	manifest: FrameworkManifest,
	services: ServiceAugment[]
): Promise<void> {
	const fullPath = join(dest, manifest.checklistFile.path);
	if (!existsSync(fullPath)) {
		if (services.length === 0) {
			return;
		}
		throw new Error(
			`Checklist file '${manifest.checklistFile.path}' declared in framework manifest is missing in ${dest}`
		);
	}

	let source = await readFile(fullPath, 'utf8');
	const pattern = checklistMarkerPattern(manifest.checklistFile.syntax);
	const match = source.match(pattern);

	if (!match) {
		return;
	}

	const leadingNewline = match[1] ?? '';
	const leadingWs = match[2] ?? '';

	let replacement: string;
	if (services.length === 0) {
		replacement = leadingNewline;
	} else {
		const checklist = renderChecklist(services, manifest.checklistFile.syntax, leadingWs);
		replacement = `${leadingNewline}${checklist}\n`;
	}

	source = source.replace(pattern, replacement);
	source = collapseExtraBlankLines(source);

	await writeFile(fullPath, source);
}

/**
 * Render a services checklist section for the given framework syntax.
 */
function renderChecklist(services: ServiceAugment[], syntax: MarkerSyntax, indent: string): string {
	const items = services
		.map((s) => {
			switch (syntax) {
				case '//':
					return `${indent}// - ${s.label}`;
				case '{/* */}':
					return `${indent}<div class="flex items-center gap-2 text-sm text-gray-400">
${indent}\t<div class="flex size-3 shrink-0 items-center justify-center rounded border border-cyan-500 bg-cyan-950">
${indent}\t\t<svg aria-hidden="true" class="size-2" fill="none" stroke="var(--color-cyan-500)" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
${indent}\t</div>
${indent}\t${s.label}
${indent}</div>`;
				case '<!-- -->':
					return `${indent}<div class="flex items-center gap-2 text-sm text-gray-400">
${indent}\t<div class="flex size-3 shrink-0 items-center justify-center rounded border border-cyan-500 bg-cyan-950">
${indent}\t\t<svg aria-hidden="true" class="size-2" fill="none" stroke="var(--color-cyan-500)" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
${indent}\t</div>
${indent}\t${s.label}
${indent}</div>`;
			}
		})
		.join('\n');

	let wrapper: string;
	switch (syntax) {
		case '//':
			wrapper = `${indent}// Services configured:\n${items}`;
			break;
		case '{/* */}':
			wrapper = `${indent}<div class="rounded-lg border border-gray-900 bg-black p-8">
${indent}\t<h3 class="m-0 mb-4 text-lg font-normal leading-none text-white">Services</h3>
${indent}\t<div class="flex flex-col gap-3">
${items}
${indent}\t</div>
${indent}</div>`;
			break;
		case '<!-- -->':
			wrapper = `${indent}<div class="rounded-lg border border-gray-900 bg-black p-8">
${indent}\t<h3 class="m-0 mb-4 text-lg font-normal leading-none text-white">Services</h3>
${indent}\t<div class="flex flex-col gap-3">
${items}
${indent}\t</div>
${indent}</div>`;
			break;
	}

	return wrapper;
}

/**
 * Build a regex matching the checklist marker line plus its trailing newline.
 */
function checklistMarkerPattern(syntax: MarkerSyntax): RegExp {
	let body: string;
	switch (syntax) {
		case '//':
			body = `\\/\\/[ \\t]*@agentuity:services-checklist`;
			break;
		case '{/* */}':
			body = `\\{[ \\t]*\\/\\*[ \\t]*@agentuity:services-checklist[ \\t]*\\*\\/[ \\t]*\\}`;
			break;
		case '<!-- -->':
			body = `<!--[ \\t]*@agentuity:services-checklist[ \\t]*-->`;
			break;
	}
	return new RegExp(`(^|\\n)([ \\t]*)${body}[ \\t]*(\\r?\\n|$)`);
}

/**
 * Collapse runs of 3+ blank lines down to a single blank line.
 */
function collapseExtraBlankLines(source: string): string {
	return source.replace(/\n{3,}/g, '\n\n');
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

	const agentuityVersion = getVersion();

	for (const service of services) {
		for (const p of service.packages) {
			deps[p] ??= packageVersionFor(p, agentuityVersion);
		}
		for (const p of service.devPackages ?? []) {
			devDeps[p] ??= packageVersionFor(p, agentuityVersion);
		}
		for (const [name, cmd] of Object.entries(service.scripts ?? {})) {
			scripts[name] = cmd;
		}
	}

	await writeFile(path, JSON.stringify(pkg, null, '\t') + '\n');
}

function packageVersionFor(packageName: string, agentuityVersion: string): string {
	return packageName.startsWith('@agentuity/') ? agentuityVersion : 'latest';
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
