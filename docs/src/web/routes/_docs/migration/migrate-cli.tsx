import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/migration/migrate-cli')({
	component: () => <MDXPage route="migration/migrate-cli" />,
	staticData: { crumb: 'Migration CLI' },
});
