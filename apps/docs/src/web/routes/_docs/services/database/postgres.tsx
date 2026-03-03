import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/database/postgres')({
	component: () => <MDXPage route="services/database/postgres" />,
	staticData: { crumb: 'Postgres' },
});
