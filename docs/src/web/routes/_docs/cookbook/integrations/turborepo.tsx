import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/turborepo')({
	component: () => <MDXPage route="cookbook/integrations/turborepo" />,
	staticData: { crumb: 'Turborepo' },
});
