import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/tailwind-setup')({
	component: () => (
		<PlaceholderPage title="Tailwind Setup" description="Configure Tailwind CSS for your Agentuity frontend." />
	),
	staticData: { crumb: 'Tailwind Setup' },
});
