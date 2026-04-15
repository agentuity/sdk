import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/attaching-skills-to-a-coder-session'
)({
	component: () => <MDXPage route="cookbook/patterns/attaching-skills-to-a-coder-session" />,
	staticData: { crumb: 'Attach Skills' },
});
