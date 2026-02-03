import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/tutorials/understanding-agents')({
	component: () => (
		<PlaceholderPage title="Understanding Agents" description="Deep dive into how agents work." />
	),
	staticData: { crumb: 'Understanding Agents' },
});
