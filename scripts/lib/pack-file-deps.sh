#!/bin/bash
# Helpers for packing workspace packages for install tests.

if [ -z "${SDK_ROOT:-}" ]; then
	_pack_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	SDK_ROOT="$(cd "$_pack_lib_dir/../.." && pwd)"
fi

# Print dependency-first pack order for a workspace package closure (one package dir per line).
pack_file_deps_order() {
	local root_pkg=$1
	SDK_ROOT="$SDK_ROOT" ROOT_PKG="$root_pkg" bun -e '
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const sdkRoot = process.env.SDK_ROOT!;
const rootPkg = process.env.ROOT_PKG!;

function readPkg(dir: string) {
	const path = join(sdkRoot, "packages", dir, "package.json");
	return JSON.parse(readFileSync(path, "utf8")) as {
		dependencies?: Record<string, string>;
	};
}

function workspaceDepDirs(dir: string): string[] {
	const pkg = readPkg(dir);
	return Object.entries(pkg.dependencies ?? {})
		.filter(([, version]) => version === "workspace:*")
		.map(([name]) => name.replace("@agentuity/", ""))
		.filter((dep) => existsSync(join(sdkRoot, "packages", dep, "package.json")));
}

const closure = new Set<string>();
const queue = [rootPkg];
while (queue.length > 0) {
	const pkg = queue.shift()!;
	if (closure.has(pkg)) continue;
	closure.add(pkg);
	for (const dep of workspaceDepDirs(pkg)) {
		if (!closure.has(dep)) queue.push(dep);
	}
}

const inDegree = new Map<string, number>();
const dependents = new Map<string, string[]>();
for (const pkg of closure) {
	inDegree.set(pkg, 0);
	dependents.set(pkg, []);
}
for (const pkg of closure) {
	for (const dep of workspaceDepDirs(pkg)) {
		if (!closure.has(dep)) continue;
		inDegree.set(pkg, (inDegree.get(pkg) ?? 0) + 1);
		dependents.get(dep)!.push(pkg);
	}
}

const ready = [...closure].filter((pkg) => (inDegree.get(pkg) ?? 0) === 0);
const order: string[] = [];
while (ready.length > 0) {
	const pkg = ready.shift()!;
	order.push(pkg);
	for (const dependent of dependents.get(pkg) ?? []) {
		const next = (inDegree.get(dependent) ?? 0) - 1;
		inDegree.set(dependent, next);
		if (next === 0) ready.push(dependent);
	}
}

if (order.length !== closure.size) {
	console.error("ERROR: cyclic workspace dependencies in install pack closure");
	process.exit(1);
}

for (const pkg of order) console.log(pkg);
'
}

# Replace workspace:* deps with each dependency package's published version.
write_resolved_package_json() {
	local pkg=$1
	local output=$2
	SDK_ROOT="$SDK_ROOT" PKG="$pkg" OUTPUT="$output" bun -e '
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const sdkRoot = process.env.SDK_ROOT!;
const pkgDir = process.env.PKG!;
const output = process.env.OUTPUT!;
const pkgJsonPath = join(sdkRoot, "packages", pkgDir, "package.json");
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

function resolveWorkspace(name: string): string {
	const depDir = name.replace("@agentuity/", "");
	const depJsonPath = join(sdkRoot, "packages", depDir, "package.json");
	if (!existsSync(depJsonPath)) {
		throw new Error(`Missing workspace dependency package.json for ${name}`);
	}
	const depJson = JSON.parse(readFileSync(depJsonPath, "utf8")) as { version: string };
	return depJson.version;
}

for (const section of ["dependencies", "devDependencies"] as const) {
	const deps = pkgJson[section];
	if (!deps) continue;
	for (const [name, version] of Object.entries(deps)) {
		if (version === "workspace:*") {
			deps[name] = resolveWorkspace(name);
		}
	}
}

writeFileSync(output, JSON.stringify(pkgJson, null, "\t") + "\n");
'
}

# Pack one workspace package after resolving workspace:* to semver versions.
pack_workspace_package_with_resolved_versions() {
	local pkg=$1
	local tarball_dir=$2
	local version

	cd "$SDK_ROOT/packages/$pkg"
	version=$(node -p "require('./package.json').version")
	write_resolved_package_json "$pkg" package.json.tmp
	mv package.json package.json.bak
	mv package.json.tmp package.json

	if grep -q 'workspace:\*' package.json; then
		echo "ERROR: unresolved workspace:* deps in packages/$pkg/package.json" >&2
		grep 'workspace:\*' package.json >&2 || true
		mv package.json.bak package.json
		exit 1
	fi

	rm -f "$tarball_dir/agentuity-${pkg}-${version}.tgz"
	npm pack --pack-destination "$tarball_dir" >/dev/null
	mv package.json.bak package.json
}
