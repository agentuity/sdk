import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view.tsx';

export const Route = createFileRoute('/demo/key-value')({
	component: () => <DemoView demoId="key-value" />,
	staticData: { crumb: 'Demo' },
});
