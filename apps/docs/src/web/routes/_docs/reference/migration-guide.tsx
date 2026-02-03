import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/migration-guide')({
	component: () => (
		<PlaceholderPage title="Migration Guide" description="Migrate from previous versions of Agentuity." />
	),
	staticData: { crumb: 'Migration Guide' },
});
