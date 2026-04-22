import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/hono-rpc-tanstack-query')({
	component: () => <MDXPage route="cookbook/patterns/hono-rpc-tanstack-query" />,
	staticData: { crumb: 'Hono RPC + TanStack Query' },
});
