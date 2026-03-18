import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/openai-agents')({
	component: () => <MDXPage route="cookbook/integrations/openai-agents" />,
	staticData: { crumb: 'OpenAI Agents SDK' },
});
