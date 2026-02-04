import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/opencode-plugin')({
	component: () => <MDXPage route="reference/cli/opencode-plugin" />,
	staticData: { crumb: 'Opencode Plugin' },
});
