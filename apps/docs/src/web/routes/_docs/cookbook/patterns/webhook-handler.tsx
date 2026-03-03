import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/webhook-handler')({
	component: () => <MDXPage route="cookbook/patterns/webhook-handler" />,
	staticData: { crumb: 'Webhook Handler' },
});
