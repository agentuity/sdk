import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/cron-with-storage')({
	component: () => <MDXPage route="cookbook/patterns/cron-with-storage" />,
	staticData: { crumb: 'Cron with Storage' },
});
