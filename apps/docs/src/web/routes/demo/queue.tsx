import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/queue')({
	component: () => <DemoView demoId="queue" />,
	staticData: { crumb: 'Demo' },
});
