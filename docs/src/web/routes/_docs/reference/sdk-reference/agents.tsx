import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/agents')({
	component: () => <MDXPage route="reference/sdk-reference/agents" />,
	staticData: { crumb: 'Agents' },
});
