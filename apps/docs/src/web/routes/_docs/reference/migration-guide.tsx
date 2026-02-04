import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/migration-guide')({
	component: () => <MDXPage route="reference/migration-guide" />,
	staticData: { crumb: 'Migration Guide' },
});
