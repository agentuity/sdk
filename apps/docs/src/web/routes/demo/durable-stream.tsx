import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/durable-stream')({
	component: () => <DemoView demoId="durable-stream" />,
	staticData: { crumb: 'Demo' },
});
