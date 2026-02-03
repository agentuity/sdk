import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/frontend/provider-setup')({
	component: () => (
		<PlaceholderPage title="Provider Setup" description="Configure the AgentuityProvider for React." />
	),
	staticData: { crumb: 'Provider Setup' },
});
