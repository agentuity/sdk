import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const elem = document.getElementById('root')!;
const app = (
	<StrictMode>
		<App />
	</StrictMode>
);

if (import.meta.hot) {
	import.meta.hot.data.root ??= createRoot(elem);
	const root = import.meta.hot.data.root;
	root.render(app);
} else {
	createRoot(elem).render(app);
}
