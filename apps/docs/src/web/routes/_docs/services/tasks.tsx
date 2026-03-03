import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/tasks')({
	component: () => <MDXPage route="services/tasks" />,
	staticData: { crumb: 'Tasks' },
});
