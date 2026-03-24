import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/apis/when-to-use')({
	beforeLoad: () => {
		throw redirect({ to: '/agents/when-to-use' });
	},
});
