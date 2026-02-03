import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/workbench')({
	component: () => (
		<PlaceholderPage
			title="Workbench"
			description="Use the visual workbench to test and debug your agents."
		/>
	),
	staticData: { crumb: 'Workbench' },
});
