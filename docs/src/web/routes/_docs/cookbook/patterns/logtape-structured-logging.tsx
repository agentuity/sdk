import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/logtape-structured-logging')({
	component: () => <MDXPage route="cookbook/patterns/logtape-structured-logging" />,
	staticData: { crumb: 'LogTape Logging' },
});
