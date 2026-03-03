import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/frontend/rpc-client')({
	component: () => <MDXPage route="frontend/rpc-client" />,
	staticData: { crumb: 'RPC Client' },
});
