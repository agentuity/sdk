import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/claude-agent')({
	component: () => <MDXPage route="cookbook/integrations/claude-agent" />,
	staticData: { crumb: 'Claude Agent SDK' },
});
