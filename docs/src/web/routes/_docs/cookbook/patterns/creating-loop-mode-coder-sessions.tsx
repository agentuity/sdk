import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/creating-loop-mode-coder-sessions')({
	component: () => <MDXPage route="cookbook/patterns/creating-loop-mode-coder-sessions" />,
	staticData: { crumb: 'Loop-Mode Sessions' },
});
