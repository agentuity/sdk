import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/agents/chat-and-streaming')({
	component: () => <MDXPage route="build/agents/chat-and-streaming" />,
	staticData: { crumb: 'Chat and Streaming' },
});
