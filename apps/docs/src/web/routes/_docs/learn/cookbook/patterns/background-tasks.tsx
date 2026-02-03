import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/background-tasks')({
	component: () => (
		<PlaceholderPage title="Background Tasks" description="Run tasks in the background with waitUntil." />
	),
	staticData: { crumb: 'Background Tasks' },
});
