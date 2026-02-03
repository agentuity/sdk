import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/routes/sse')({
	component: () => (
		<PlaceholderPage title="Server-Sent Events" description="Stream events from server to client." />
	),
	staticData: { crumb: 'SSE' },
});
