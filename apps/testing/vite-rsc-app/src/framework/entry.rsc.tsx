import { renderToReadableStream } from '@vitejs/plugin-rsc/rsc';
import App from '../components/App.tsx';

// The plugin assumes `rsc` entry has a default export of a request handler
export default async function handler(request: Request): Promise<Response> {
	// Serialize React VDOM to RSC stream
	const root = (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Agentuity + Vite RSC</title>
			</head>
			<body>
				<div id="root">
					<App />
				</div>
			</body>
		</html>
	);

	const rscStream = renderToReadableStream(root);

	// Respond to direct RSC stream requests (used by browser for client-side re-rendering)
	if (new URL(request.url).pathname.endsWith('.rsc')) {
		return new Response(rscStream, {
			headers: {
				'Content-Type': 'text/x-component;charset=utf-8',
			},
		});
	}

	// Delegate to SSR environment for HTML rendering
	const ssrEntry = await import.meta.viteRsc.loadModule<typeof import('./entry.ssr.tsx')>(
		'ssr',
		'index'
	);
	const htmlStream = await ssrEntry.handleSsr(rscStream);

	return new Response(htmlStream, {
		headers: {
			'Content-Type': 'text/html',
		},
	});
}

// Enable HMR for server module changes
if (import.meta.hot) {
	import.meta.hot.accept();
}
