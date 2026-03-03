import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/websockets')({
	component: () => <MDXPage route="routes/websockets" />,
	staticData: { crumb: 'WebSockets' },
});
