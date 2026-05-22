import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/git-integration')({
	component: () => <MDXPage route="reference/cli/git-integration" />,
	staticData: { crumb: 'Git Integration' },
});
