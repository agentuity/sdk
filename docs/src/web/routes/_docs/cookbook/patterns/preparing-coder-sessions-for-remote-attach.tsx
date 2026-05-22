import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/preparing-coder-sessions-for-remote-attach'
)({
	component: () => (
		<MDXPage route="cookbook/patterns/preparing-coder-sessions-for-remote-attach" />
	),
	staticData: { crumb: 'Reconnect Sessions' },
});
