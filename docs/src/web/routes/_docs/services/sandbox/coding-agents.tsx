import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/sandbox/coding-agents')({
	component: () => <MDXPage route="services/sandbox/coding-agents" />,
	staticData: { crumb: 'Coding Agents' },
});
