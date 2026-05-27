import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/apps-and-apis/background-work')({
	component: () => <MDXPage route="build/apps-and-apis/background-work" />,
	staticData: { crumb: 'Background Work' },
});
