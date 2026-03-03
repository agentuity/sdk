import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/sse')({
	component: () => <MDXPage route="routes/sse" />,
	staticData: { crumb: 'SSE' },
});
