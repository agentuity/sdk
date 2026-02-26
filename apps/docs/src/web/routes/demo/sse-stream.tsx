import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/sse-stream')({
	component: () => <DemoView demoId="sse-stream" />,
	staticData: { crumb: 'Demo' },
});
