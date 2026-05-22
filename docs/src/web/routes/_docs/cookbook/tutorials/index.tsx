import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/cookbook/tutorials/')({
	component: () => <Navigate to="/cookbook/tutorials/understanding-agents" />,
	staticData: { crumb: 'Tutorials' },
});
