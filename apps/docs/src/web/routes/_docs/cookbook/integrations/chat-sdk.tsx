import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/integrations/chat-sdk')({
	component: () => <MDXPage route="cookbook/integrations/chat-sdk" />,
	staticData: { crumb: 'Chat SDK' },
});
