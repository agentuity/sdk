import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/nextjs')({
	component: () => <MDXPage route="cookbook/integrations/nextjs" />,
	staticData: { crumb: 'Next.js' },
});
