import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/ai-gateway')({
	component: () => <MDXPage route="services/ai-gateway" />,
	staticData: { crumb: 'AI Gateway' },
});
