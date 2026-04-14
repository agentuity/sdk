import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/creating-coder-sessions-with-sdk')({
	component: () => <MDXPage route="cookbook/patterns/creating-coder-sessions-with-sdk" />,
	staticData: { crumb: 'Manage Coder Sessions' },
});
