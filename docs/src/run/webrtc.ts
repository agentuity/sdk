/**
 * Standalone run script for the WebRTC signaling demo
 *
 * The live Explorer page uses browser WebRTC APIs and a WebSocket signaling
 * route. Sandboxes cannot open a camera, so this script shows the protocol
 * flow that the page runs in a browser.
 *
 * Usage: bun run src/run/webrtc.ts '{}'
 */

const roomId = `demo-${Date.now().toString(36)}`;
const peerA = crypto.randomUUID().slice(0, 8);
const peerB = crypto.randomUUID().slice(0, 8);

console.log('---OUTPUT---');
console.log(`Room: ${roomId}`);
console.log(`Peer A joins as ${peerA}`);
console.log(`Peer B joins as ${peerB}`);
console.log('');
console.log('Signaling flow:');
console.log('  1. Peer A opens /api/webrtc/signal?room=' + roomId);
console.log('  2. Peer B joins the same room');
console.log('  3. Server tells Peer A to create an offer');
console.log('  4. Peer A sends an SDP offer over the signaling socket');
console.log('  5. Peer B sets the remote offer and sends an SDP answer');
console.log('  6. Both peers relay ICE candidates through the same socket');
console.log('  7. Media and data channel traffic move directly between browsers');
console.log('');
console.log('Agentuity hosts the app and WebSocket relay. Browser WebRTC carries media.');
console.log('---OUTPUT---');
