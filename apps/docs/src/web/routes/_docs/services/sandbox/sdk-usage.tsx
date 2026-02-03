import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/sandbox/sdk-usage')({
	component: () => (
		<PlaceholderPage title="SDK Usage" description="Use the sandbox SDK to run code." />
	),
	staticData: { crumb: 'SDK Usage' },
});
