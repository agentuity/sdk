import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/agents/schema-libraries')({
	component: () => <MDXPage route="agents/schema-libraries" />,
	staticData: { crumb: 'Schema Libraries' },
});
