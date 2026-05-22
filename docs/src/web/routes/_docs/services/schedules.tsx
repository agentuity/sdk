import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/schedules')({
	component: () => <MDXPage route="services/schedules" />,
	staticData: { crumb: 'Schedules' },
});
