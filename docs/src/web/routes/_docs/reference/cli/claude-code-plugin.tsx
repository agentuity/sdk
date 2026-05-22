import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/claude-code-plugin')({
	component: () => <MDXPage route="reference/cli/claude-code-plugin" />,
	staticData: { crumb: 'Claude Code Plugin' },
});
