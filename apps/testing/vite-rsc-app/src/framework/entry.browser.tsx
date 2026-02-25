import { createFromFetch } from '@vitejs/plugin-rsc/browser';
import { hydrateRoot } from 'react-dom/client';

async function main() {
	// Fetch and deserialize RSC stream back to React VDOM
	const rscResponse = fetch(window.location.href + '.rsc');
	const root = await createFromFetch(rscResponse);

	// Hydrate (or mount) the React tree into the existing DOM
	hydrateRoot(document, root);
}

main().catch(console.error);

// Listen for RSC updates during development (HMR)
if (import.meta.hot) {
	import.meta.hot.on('rsc:update', async () => {
		const { createFromFetch: refetch } = await import('@vitejs/plugin-rsc/browser');
		const rscPayload = await refetch(fetch(window.location.href + '.rsc'));
		hydrateRoot(document, rscPayload);
	});
}
