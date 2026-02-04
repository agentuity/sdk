import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/build-configuration')({
	component: () => <MDXPage route="reference/cli/build-configuration" />,
	staticData: { crumb: 'Build Configuration' },
});
