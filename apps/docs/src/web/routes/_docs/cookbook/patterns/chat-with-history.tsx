import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/chat-with-history')({
	component: () => <MDXPage route="cookbook/patterns/chat-with-history" />,
	staticData: { crumb: 'Chat with History' },
});
