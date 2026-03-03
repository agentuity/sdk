import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/cookbook/tutorials/understanding-agents')({
	component: () => <MDXPage route="cookbook/tutorials/understanding-agents" />,
	staticData: { crumb: 'Understanding Agents' },
});
