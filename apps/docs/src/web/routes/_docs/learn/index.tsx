import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/learn/')({
	component: () => <Navigate to="/learn/cookbook" />,
	staticData: { crumb: 'Learn' },
});
