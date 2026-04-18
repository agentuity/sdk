import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/sse-stream')({
	component: () => <DemoView demoId="sse-stream" />,
	staticData: { crumb: 'Demo' },
});
