import yaml from 'yaml';

interface ParsedFrontmatter<T = Record<string, unknown>> {
	data: T;
	body: string;
}

export function parseFrontmatter<T = Record<string, unknown>>(
	content: string
): ParsedFrontmatter<T> {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return { data: {} as T, body: content.trim() };
	}

	const frontmatter = match[1];
	const body = content.slice(match[0].length).trim();

	try {
		const data = yaml.parse(frontmatter) as T;
		return { data: (data ?? {}) as T, body };
	} catch {
		return { data: {} as T, body: content.trim() };
	}
}
