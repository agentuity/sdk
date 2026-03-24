import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/langchain')({
	component: () => <MDXPage route="cookbook/integrations/langchain" />,
	staticData: { crumb: 'LangChain' },
});
