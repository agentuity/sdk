import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/learn/cookbook/tutorials/')({
	component: () => <Navigate to="/learn/cookbook/tutorials/understanding-agents" />,
	staticData: { crumb: 'Tutorials' },
});
