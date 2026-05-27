import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/agents/tool-calling')({
	component: () => <MDXPage route="build/agents/tool-calling" />,
	staticData: { crumb: 'Tool Calling' },
});
