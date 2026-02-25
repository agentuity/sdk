import { createFromFetch } from '@vitejs/plugin-rsc/browser';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { ReactNode } from 'react';

async function main(): Promise<Root> {
	// Fetch and deserialize RSC stream back to React VDOM
	const rscResponse = fetch(window.location.href + '.rsc');
	const root = (await createFromFetch(rscResponse)) as ReactNode;

	// Hydrate (or mount) the React tree into the existing DOM
	return hydrateRoot(document, root);
}

const hydratedRootPromise = main();
hydratedRootPromise.catch((err) => {
	console.error('[vite-rsc] Hydration failed:', err);
});

// Listen for RSC updates during development (HMR)
if (import.meta.hot) {
	import.meta.hot.on('rsc:update', async () => {
		const { createFromFetch: refetch } = await import('@vitejs/plugin-rsc/browser');
		const rscPayload = (await refetch(fetch(window.location.href + '.rsc'))) as ReactNode;
		(await hydratedRootPromise).render(rscPayload);
	});
}
