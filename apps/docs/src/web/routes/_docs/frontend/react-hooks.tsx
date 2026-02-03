import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/frontend/react-hooks')({
	component: () => (
		<PlaceholderPage title="React Hooks" description="Use React hooks to interact with agents." />
	),
	staticData: { crumb: 'React Hooks' },
});
