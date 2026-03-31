import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/evals')({
	component: () => <DemoView demoId="evals" />,
	staticData: { crumb: 'Demo' },
});
