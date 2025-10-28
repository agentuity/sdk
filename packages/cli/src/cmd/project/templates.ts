const GITHUB_REPO = 'agentuity/sdk';
const GITHUB_BRANCH = 'main';
const TEMPLATES_JSON_PATH = 'templates/templates.json';

export interface TemplateInfo {
	id: string;
	name: string;
	description: string;
	directory: string;
}

interface TemplatesManifest {
	templates: TemplateInfo[];
}

export async function fetchTemplates(localDir?: string, branch?: string): Promise<TemplateInfo[]> {
	// Load from local directory if provided
	if (localDir) {
		const { join } = await import('node:path');
		const { resolve } = await import('node:path');
		const manifestPath = resolve(join(localDir, 'templates.json'));
		const file = Bun.file(manifestPath);

		if (!(await file.exists())) {
			throw new Error(`templates.json not found at ${manifestPath}`);
		}

		const manifest = (await file.json()) as TemplatesManifest;
		return manifest.templates;
	}

	// Fetch from GitHub
	const branchToUse = branch || GITHUB_BRANCH;
	const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${branchToUse}/${TEMPLATES_JSON_PATH}`;

	const headers: Record<string, string> = {};
	if (process.env.GITHUB_TOKEN) {
		headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
	}

	const response = await fetch(url, { headers });
	if (!response.ok) {
		throw new Error(`Failed to fetch templates: ${response.statusText}`);
	}

	const manifest = (await response.json()) as TemplatesManifest;
	return manifest.templates;
}
