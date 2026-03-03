import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/apis/calling-agents')({
	component: () => <MDXPage route="apis/calling-agents" />,
	staticData: { crumb: 'Calling Agents' },
});
