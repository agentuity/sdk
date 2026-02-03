import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/services/sandbox/')({
	component: () => (
		<PlaceholderPage title="Sandbox" description="Run code securely in isolated environments." />
	),
	staticData: { crumb: 'Sandbox' },
});
