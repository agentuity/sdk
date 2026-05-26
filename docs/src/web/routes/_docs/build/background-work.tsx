import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/background-work')({
	component: () => <MDXPage route="build/background-work" />,
	staticData: { crumb: 'Background Work' },
});
