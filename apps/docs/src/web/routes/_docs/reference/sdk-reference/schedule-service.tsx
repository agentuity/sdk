import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/schedule-service')({
	component: () => <MDXPage route="reference/sdk-reference/schedule-service" />,
	staticData: { crumb: 'Schedule Service' },
});
