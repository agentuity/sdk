import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference')({
	component: () => (
		<PlaceholderPage title="SDK Reference" description="Complete API reference for the Agentuity SDK." />
	),
	staticData: { crumb: 'SDK Reference' },
});
