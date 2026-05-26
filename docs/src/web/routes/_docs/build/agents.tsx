import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/agents')({
	component: () => <MDXPage route="build/agents" />,
	staticData: { crumb: 'Build Agents' },
});
