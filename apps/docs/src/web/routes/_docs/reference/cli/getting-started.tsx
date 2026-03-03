import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/reference/cli/getting-started')({
	component: () => <MDXPage route="reference/cli/getting-started" />,
	staticData: { crumb: 'Getting Started' },
});
