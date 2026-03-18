import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/schedules')({
	component: () => <MDXPage route="reference/api/schedules" />,
	staticData: { crumb: 'Schedules' },
});
