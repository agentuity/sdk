import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/agents/state-management')({
	component: () => <MDXPage route="agents/state-management" />,
	staticData: { crumb: 'State Management' },
});
