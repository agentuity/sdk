import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/database/drizzle')({
	component: () => <MDXPage route="services/database/drizzle" />,
	staticData: { crumb: 'Drizzle' },
});
