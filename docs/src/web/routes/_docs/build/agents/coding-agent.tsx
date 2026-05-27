import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/agents/coding-agent')({
	component: () => <MDXPage route="build/agents/coding-agent" />,
	staticData: { crumb: 'Coding Agents' },
});
