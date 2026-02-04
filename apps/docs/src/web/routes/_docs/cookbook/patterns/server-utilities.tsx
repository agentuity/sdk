import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/server-utilities')({
	component: () => <MDXPage route="cookbook/patterns/server-utilities" />,
	staticData: { crumb: 'Server Utilities' },
});
