import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/agents/standalone-execution')({
	component: () => <MDXPage route="agents/standalone-execution" />,
	staticData: { crumb: 'Standalone Execution' },
});
