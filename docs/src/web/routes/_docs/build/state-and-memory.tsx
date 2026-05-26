import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/state-and-memory')({
	component: () => <MDXPage route="build/state-and-memory" />,
	staticData: { crumb: 'State and Memory' },
});
