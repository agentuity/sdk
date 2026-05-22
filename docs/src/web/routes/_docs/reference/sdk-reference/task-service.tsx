import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/task-service')({
	component: () => <MDXPage route="reference/sdk-reference/task-service" />,
	staticData: { crumb: 'Task Service' },
});
