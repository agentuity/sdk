import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_docs/reference/sdk-reference')({
	component: () => <Outlet />,
});
