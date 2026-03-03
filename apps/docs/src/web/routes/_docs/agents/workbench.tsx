import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/agents/workbench')({
	component: () => <MDXPage route="agents/workbench" />,
	staticData: { crumb: 'Workbench' },
});
