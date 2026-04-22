import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/observing-a-coder-session-through-the-hub'
)({
	component: () => <MDXPage route="cookbook/patterns/observing-a-coder-session-through-the-hub" />,
	staticData: { crumb: 'Observe Sessions' },
});
