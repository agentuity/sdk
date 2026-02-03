import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/routes/websockets')({
	component: () => (
		<PlaceholderPage title="WebSockets" description="Create real-time bidirectional connections." />
	),
	staticData: { crumb: 'WebSockets' },
});
