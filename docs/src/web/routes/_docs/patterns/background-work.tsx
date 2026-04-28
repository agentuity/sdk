import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/patterns/background-work')({
	component: () => <MDXPage route="patterns/background-work" />,
	staticData: { crumb: 'Background Work' },
});
