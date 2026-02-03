import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/frontend/rpc-client')({
	component: () => (
		<PlaceholderPage title="RPC Client" description="Type-safe agent calls from the frontend." />
	),
	staticData: { crumb: 'RPC Client' },
});
