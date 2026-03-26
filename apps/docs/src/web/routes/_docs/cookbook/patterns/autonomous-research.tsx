import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/autonomous-research')({
	component: () => <MDXPage route="cookbook/patterns/autonomous-research" />,
	staticData: { crumb: 'Autonomous Research' },
});
