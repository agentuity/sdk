import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/standalone-packages')({
	component: () => <MDXPage route="reference/standalone-packages" />,
	staticData: { crumb: 'Standalone Packages' },
});
