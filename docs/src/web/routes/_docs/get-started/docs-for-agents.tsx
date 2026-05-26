import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/get-started/docs-for-agents')({
	component: () => <MDXPage route="get-started/docs-for-agents" />,
	staticData: { crumb: 'Docs for Agents' },
});
