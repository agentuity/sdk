/**
 * Transforms a document path (e.g., "Agents/index.mdx") to a proper URL (e.g., "/Agents").
 */
export function documentPathToUrl(docPath: string): string {
	// Remove the .md or .mdx extension before any # symbol
	const path = docPath.replace(/\.mdx?(?=#|$)/, '');

	// Split path and hash (if any)
	const [basePath = '', hash] = path.split('#');

	// Split the base path into segments
	const segments = basePath.split('/').filter(Boolean);

	// If the last segment is 'index', remove it
	if (
		segments.length > 0 &&
		segments[segments.length - 1]?.toLowerCase() === 'index'
	) {
		segments.pop();
	}

	// Reconstruct the path
	let url = segments.length > 0 ? `/${segments.join('/')}` : '/';
	if (hash) {
		url += `#${hash}`;
	}
	return url;
}
