import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/webhook-handler')({
	component: () => (
		<PlaceholderPage title="Webhook Handler" description="Handle incoming webhooks with agents." />
	),
	staticData: { crumb: 'Webhook Handler' },
});
