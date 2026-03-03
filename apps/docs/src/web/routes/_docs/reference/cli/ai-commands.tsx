import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/reference/cli/ai-commands')({
	component: () => <MDXPage route="reference/cli/ai-commands" />,
	staticData: { crumb: 'AI Commands' },
});
