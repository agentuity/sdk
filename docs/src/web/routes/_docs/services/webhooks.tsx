import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/webhooks')({
	component: () => <MDXPage route="services/webhooks" />,
	staticData: { crumb: 'Webhooks' },
});
