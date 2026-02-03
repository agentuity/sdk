import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/agents/schema-libraries')({
	component: () => (
		<PlaceholderPage
			title="Schema Libraries"
			description="Use Zod, Valibot, or other schema libraries with agents."
		/>
	),
	staticData: { crumb: 'Schema Libraries' },
});
