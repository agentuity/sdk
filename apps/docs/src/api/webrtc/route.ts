import { createRouter, webrtc } from '@agentuity/runtime';

const router = createRouter();

router.get('/', (c) => {
	return c.json({
		name: 'WebRTC Signaling',
		description: 'Connect to /api/webrtc/signal for peer-to-peer WebRTC signaling',
		features: ['Room-based peer discovery', 'SDP offer/answer relay', 'ICE candidate relay'],
	});
});

router.get('/signal', webrtc({ maxPeers: 2 }));

export default router;
