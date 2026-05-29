import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/structured-logging-with-pino')({
	component: () => <MDXPage route="cookbook/patterns/structured-logging-with-pino" />,
	staticData: { crumb: 'Pino Logging' },
});
