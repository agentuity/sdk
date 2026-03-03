import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/cookbook/patterns/background-tasks')({
	component: () => <MDXPage route="cookbook/patterns/background-tasks" />,
	staticData: { crumb: 'Background Tasks' },
});
