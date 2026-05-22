import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/agents/')({
	component: () => <MDXPage route="agents" />,
	staticData: { crumb: 'Agents' },
});
