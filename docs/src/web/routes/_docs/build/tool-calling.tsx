import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/tool-calling')({
	component: () => <MDXPage route="build/tool-calling" />,
	staticData: { crumb: 'Tool Calling' },
});
