/**
 * Pin workspace dependencies to the version from the root package.json.
 *
 * Replaces all `workspace:*` references in package.json with the exact
 * version from the monorepo root. This makes the package.json self-contained
 * for deployment without needing the monorepo workspace.
 *
 * Usage: bun run scripts/pin-workspace-deps.ts
 */
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const ROOT_PACKAGE_JSON = resolve(ROOT, '../../package.json');

const rootPkg = await Bun.file(ROOT_PACKAGE_JSON).json();
const version: string = rootPkg.version;

const packageJson = await Bun.file(PACKAGE_JSON).json();
const sections = ['dependencies', 'devDependencies'] as const;

let count = 0;
for (const section of sections) {
	const deps = packageJson[section];
	if (!deps) continue;
	for (const [name, val] of Object.entries(deps)) {
		if (typeof val === 'string' && val.startsWith('workspace:')) {
			console.log(`  ${name}: ${val} -> ${version}`);
			deps[name] = version;
			count++;
		}
	}
}

if (count === 0) {
	console.log('No workspace dependencies found');
	process.exit(0);
}

await Bun.write(PACKAGE_JSON, JSON.stringify(packageJson, null, '\t') + '\n');
console.log(`\nPinned ${count} dependencies to ${version}`);
