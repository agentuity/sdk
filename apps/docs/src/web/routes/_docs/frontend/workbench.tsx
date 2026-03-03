import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/frontend/workbench')({
	component: () => <MDXPage route="frontend/workbench" />,
	staticData: { crumb: 'Workbench' },
});
