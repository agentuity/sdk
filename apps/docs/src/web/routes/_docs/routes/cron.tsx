import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/routes/cron')({
	component: () => <MDXPage route="routes/cron" />,
	staticData: { crumb: 'Cron' },
});
