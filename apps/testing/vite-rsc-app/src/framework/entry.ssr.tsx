import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr';
import { renderToReadableStream } from 'react-dom/server.edge';

export async function handleSsr(rscStream: ReadableStream) {
	// Tee the stream so we can use it for both SSR and client hydration
	const [rscStream1, rscStream2] = rscStream.tee();

	// Deserialize RSC stream back to React VDOM
	const root = await createFromReadableStream(rscStream1);

	// Get the bootstrap script to kick off client-side hydration
	const bootstrapScriptContent = await import.meta.viteRsc.loadBootstrapScriptContent('index');

	// Render HTML (traditional SSR)
	const htmlStream = await renderToReadableStream(root, {
		bootstrapScriptContent,
	});

	return htmlStream;
}
