import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/hono')({
	component: () => <MDXPage route="frameworks/hono" />,
	staticData: { crumb: 'Hono' },
});
