import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/evaluations')({
	component: () => (
		<PlaceholderPage
			title="Evaluations"
			description="Run automated quality checks on agent responses."
		/>
	),
	staticData: { crumb: 'Evaluations' },
});
