import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/tanstack-start')({
	component: () => <MDXPage route="cookbook/integrations/tanstack-start" />,
	staticData: { crumb: 'TanStack Start' },
});
