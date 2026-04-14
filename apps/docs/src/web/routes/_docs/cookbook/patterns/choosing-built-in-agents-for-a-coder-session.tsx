import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/choosing-built-in-agents-for-a-coder-session'
)({
	component: () => (
		<MDXPage route="cookbook/patterns/choosing-built-in-agents-for-a-coder-session" />
	),
	staticData: { crumb: 'Built-In Agents' },
});
