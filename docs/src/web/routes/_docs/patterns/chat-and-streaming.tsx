import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/patterns/chat-and-streaming')({
	component: () => <MDXPage route="patterns/chat-and-streaming" />,
	staticData: { crumb: 'Chat and Streaming' },
});
