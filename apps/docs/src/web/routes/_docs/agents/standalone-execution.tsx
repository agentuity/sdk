import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/standalone-execution')({
	component: () => (
		<PlaceholderPage
			title="Standalone Execution"
			description="Run agents outside the Agentuity runtime."
		/>
	),
	staticData: { crumb: 'Standalone Execution' },
});
