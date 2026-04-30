import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/mastra')({
	component: () => <MDXPage route="cookbook/integrations/mastra" />,
	staticData: { crumb: 'Mastra' },
});
