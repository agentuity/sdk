/**
 * Standalone run script for the WebRTC signaling demo
 *
 * The live Explorer page uses browser WebRTC APIs and a WebSocket signaling
 * route. Sandboxes cannot open a camera, so this script shows the protocol
 * flow that the page runs in a browser.
 *
 * Usage: bun run src/run/webrtc.ts '{}'
 */
import { writeSandboxOutput } from '../lib/sandbox-output-writer';

const roomId = `demo-${Date.now().toString(36)}`;
const peerA = crypto.randomUUID().slice(0, 8);
const peerB = crypto.randomUUID().slice(0, 8);

writeSandboxOutput(
	[
		`Room: ${roomId}`,
		`Peer A joins as ${peerA}`,
		`Peer B joins as ${peerB}`,
		'',
		'Signaling flow:',
		'  1. Peer A opens /api/webrtc/signal?room=' + roomId,
		'  2. Peer B joins the same room',
		'  3. Server tells Peer A to create an offer',
		'  4. Peer A sends an SDP offer over the signaling socket',
		'  5. Peer B sets the remote offer and sends an SDP answer',
		'  6. Both peers relay ICE candidates through the same socket',
		'  7. Media and data channel traffic move directly between browsers',
		'',
		'Agentuity hosts the app and WebSocket relay. Browser WebRTC carries media.',
	].join('\n')
);
