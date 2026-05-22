import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/webhooks')({
	component: () => <MDXPage route="reference/api/webhooks" />,
	staticData: { crumb: 'Webhooks' },
});
