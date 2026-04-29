import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/cookbook/patterns/')({
	component: () => <Navigate to="/cookbook/patterns/chat-with-history" />,
	staticData: { crumb: 'Patterns' },
});
