import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/migration/from-v2')({
	component: () => <MDXPage route="migration/from-v2" />,
	staticData: { crumb: 'From v2' },
});
