import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/chat-with-history')({
	component: () => (
		<PlaceholderPage title="Chat with History" description="Build a chat agent with conversation history." />
	),
	staticData: { crumb: 'Chat with History' },
});
