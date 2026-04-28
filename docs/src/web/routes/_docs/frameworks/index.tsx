import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/')({
	component: () => <MDXPage route="frameworks" />,
	staticData: { crumb: 'Frameworks' },
});
