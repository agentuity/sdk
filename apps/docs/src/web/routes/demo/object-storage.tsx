import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view.tsx';

export const Route = createFileRoute('/demo/object-storage')({
	component: () => <DemoView demoId="object-storage" />,
	staticData: { crumb: 'Demo' },
});
