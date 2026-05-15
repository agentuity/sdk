import {
	detectFrameworkWithPackageJson,
	type PackageJsonData,
	type PackageManager,
	type RuntimeName,
} from '../build/detect/index.ts';

export const PROJECT_GENERATION = '3';

export type ProjectProvider = 'bunjs' | 'nodejs';

export interface ProjectRegistrationMetadata {
	generation: typeof PROJECT_GENERATION;
	provider?: ProjectProvider;
	framework?: string;
}

const DIRECT_FRAMEWORK_DEPS: Record<string, string> = {
	hono: 'hono',
};

export function providerForPackageManager(packageManager: PackageManager): ProjectProvider {
	return packageManager === 'bun' ? 'bunjs' : 'nodejs';
}

function providerForRuntime(runtime?: RuntimeName): ProjectProvider | undefined {
	if (!runtime) return undefined;
	return runtime === 'bun' ? 'bunjs' : 'nodejs';
}

function hasDep(pkg: PackageJsonData, name: string): boolean {
	return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

function detectDirectFramework(pkg: PackageJsonData): string | undefined {
	for (const [framework, dep] of Object.entries(DIRECT_FRAMEWORK_DEPS)) {
		if (hasDep(pkg, dep)) return framework;
	}
	return undefined;
}

export async function detectProjectRegistrationMetadata(
	dir: string
): Promise<ProjectRegistrationMetadata> {
	const metadata: ProjectRegistrationMetadata = { generation: PROJECT_GENERATION };

	try {
		const { framework, packageJson } = await detectFrameworkWithPackageJson(dir);
		metadata.provider = providerForRuntime(framework?.runtime);

		if (packageJson) {
			metadata.framework = detectDirectFramework(packageJson);
		}
		if (!metadata.framework && framework?.name && framework.name !== 'generic') {
			metadata.framework = framework.name;
		}
	} catch {
		// Registration metadata is best-effort for imports; generation still marks v3.
	}

	return metadata;
}
