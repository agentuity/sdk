import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/')({
	component: () => <Navigate to="/learn/cookbook/patterns/background-tasks" />,
	staticData: { crumb: 'Patterns' },
});
