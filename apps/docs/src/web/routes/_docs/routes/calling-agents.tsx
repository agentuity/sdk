import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/calling-agents')({
	component: () => <MDXPage route="routes/calling-agents" />,
	staticData: { crumb: 'Calling Agents' },
});
