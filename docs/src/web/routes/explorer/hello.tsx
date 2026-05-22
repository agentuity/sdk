import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/hello')({
	component: () => <DemoView demoId="hello" />,
	staticData: { crumb: 'Demo' },
});
