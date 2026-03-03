import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/webrtc')({
	component: () => <MDXPage route="routes/webrtc" />,
	staticData: { crumb: 'WebRTC' },
});
