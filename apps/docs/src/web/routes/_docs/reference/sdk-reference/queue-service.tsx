import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/queue-service')({
	component: () => <MDXPage route="reference/sdk-reference/queue-service" />,
	staticData: { crumb: 'Queue Service' },
});
