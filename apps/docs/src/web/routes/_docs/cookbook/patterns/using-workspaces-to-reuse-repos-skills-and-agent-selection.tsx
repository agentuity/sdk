import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/using-workspaces-to-reuse-repos-skills-and-agent-selection'
)({
	component: () => (
		<MDXPage route="cookbook/patterns/using-workspaces-to-reuse-repos-skills-and-agent-selection" />
	),
	staticData: { crumb: 'Use Workspaces' },
});
