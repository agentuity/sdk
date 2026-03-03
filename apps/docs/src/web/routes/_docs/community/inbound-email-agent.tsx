import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/community/inbound-email-agent')({
	component: () => <MDXPage route="community/inbound-email-agent" />,
	staticData: { crumb: 'Inbound Email Agent' },
});
