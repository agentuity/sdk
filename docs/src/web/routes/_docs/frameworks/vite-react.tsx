import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/vite-react')({
	component: () => <MDXPage route="frameworks/vite-react" />,
	staticData: { crumb: 'Vite + React' },
});
