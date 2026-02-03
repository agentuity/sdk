import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/')({
	component: () => (
		<PlaceholderPage title="Cookbook" description="Practical guides, tutorials, and patterns for building with Agentuity." />
	),
	staticData: { crumb: 'Cookbook' },
});
