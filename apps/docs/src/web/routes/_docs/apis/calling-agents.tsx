import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/apis/calling-agents')({
	beforeLoad: () => {
		throw redirect({ to: '/routes/calling-agents' });
	},
});
