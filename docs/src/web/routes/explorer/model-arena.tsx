import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/model-arena')({
	component: () => <DemoView demoId="model-arena" />,
	staticData: { crumb: 'Demo' },
});
