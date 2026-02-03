import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/ai-commands')({
	component: () => (
		<PlaceholderPage title="CLI: AI Commands" description="AI-powered CLI commands." />
	),
	staticData: { crumb: 'AI Commands' },
});
