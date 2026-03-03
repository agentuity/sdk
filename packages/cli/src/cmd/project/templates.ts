import { StructuredError, Logger } from '@agentuity/core';

const GITHUB_BRANCH = 'main';

export interface TemplateInfo {
	id: string;
	name: string;
	description: string;
	directory: string;
}

interface TemplatesManifest {
	templates: TemplateInfo[];
}

const TemplateMissingConfigurationError = StructuredError('TemplateMissingConfigurationError');
const TemplateDownloadError = StructuredError('TemplateDownloadError')<{ status: number }>();

export async function fetchTemplates(
	logger: Logger,
	localDir?: string,
	branch?: string
): Promise<TemplateInfo[]> {
	// Load from local directory if provided
	if (localDir) {
		const { join } = await import('node:path');
		const { resolve } = await import('node:path');
		const manifestPath = resolve(join(localDir, 'templates.json'));
		const file = Bun.file(manifestPath);

		if (!(await file.exists())) {
			throw new TemplateMissingConfigurationError({
				message: `templates.json not found at ${manifestPath}`,
			});
		}

		const manifest = (await file.json()) as TemplatesManifest;
		return manifest.templates;
	}

	// Fetch from GitHub
	const branchToUse = branch || GITHUB_BRANCH;
	const url = `https://agentuity.sh/template/sdk/${branchToUse}`;

	const response = await fetch(url);
	if (!response.ok) {
		logger.trace('error fetching template from %s. %s', url, await response.text());
		throw new TemplateDownloadError({
			status: response.status,
			message: `Failed to fetch templates: ${response.statusText}`,
		});
	}

	const manifest = (await response.json()) as TemplatesManifest;
	return manifest.templates;
}
