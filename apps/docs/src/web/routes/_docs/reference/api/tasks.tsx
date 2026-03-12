import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/tasks')({
	component: () => <MDXPage route="reference/api/tasks" />,
	staticData: { crumb: 'Tasks' },
});
