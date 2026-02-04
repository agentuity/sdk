import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/agents/events-lifecycle')({
	component: () => <MDXPage route="agents/events-lifecycle" />,
	staticData: { crumb: 'Events & Lifecycle' },
});
