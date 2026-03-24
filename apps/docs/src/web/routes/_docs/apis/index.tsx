import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/apis/')({
	beforeLoad: () => {
		throw redirect({ to: '/agents/when-to-use' });
	},
});
