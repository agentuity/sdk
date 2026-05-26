import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/get-started/agent-driven-setup')({
	component: () => <MDXPage route="get-started/agent-driven-setup" />,
	staticData: { crumb: 'Agentic setup' },
});
