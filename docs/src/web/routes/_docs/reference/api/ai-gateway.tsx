import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/ai-gateway')({
	component: () => <MDXPage route="reference/api/ai-gateway" />,
	staticData: { crumb: 'AI Gateway' },
});
