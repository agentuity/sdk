import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/agents/calling-other-agents')({
	component: () => <MDXPage route="agents/calling-other-agents" />,
	staticData: { crumb: 'Calling Other Agents' },
});
