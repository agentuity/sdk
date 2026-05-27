import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/agents/state-and-memory')({
	component: () => <MDXPage route="build/agents/state-and-memory" />,
	staticData: { crumb: 'State and Memory' },
});
