import { createRouter } from '@agentuity/runtime';
import docQAAgent from '@agent/doc_qa';

const router = createRouter();

/**
 * Transforms a document path (e.g., "Agents/index.mdx") to a proper URL (e.g., "/Agents")
 */
function documentPathToUrl(docPath: string): string {
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
	let url = `/${segments.join('/')}`;
	if (url === '/') {
		url = '/';
	}
	if (hash) {
		url += `#${hash}`;
	}
	return url;
}

// POST /api/doc-qa - Answer questions about documentation
router.post('/', docQAAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await docQAAgent.run(data);

	// Transform document URLs from raw paths to proper URLs
	if (result.documents && Array.isArray(result.documents)) {
		result.documents = result.documents.map((doc) => ({
			...doc,
			url: documentPathToUrl(doc.url),
		}));
	}

	return c.json(result);
});

export default router;
