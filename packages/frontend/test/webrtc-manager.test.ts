import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WebRTCManager } from '../src/webrtc-manager';

type PartialStats = Record<string, unknown> & { id: string; type: string };

function createStatsReport(reports: PartialStats[]): RTCStatsReport {
	const map = new Map<string, PartialStats>();
	for (const report of reports) {
		map.set(report.id, report);
	}
	return map as unknown as RTCStatsReport;
}

class MockRTCPeerConnection {
	ontrack: ((event: RTCTrackEvent) => void) | null = null;
	ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
	onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
	onnegotiationneeded: ((event: Event) => void | Promise<void>) | null = null;
	oniceconnectionstatechange: (() => void) | null = null;
	iceConnectionState: RTCIceConnectionState = 'new';
	signalingState: RTCSignalingState = 'stable';
	localDescription: RTCSessionDescriptionInit | null = null;
	remoteDescription: RTCSessionDescriptionInit | null = null;
	setLocalDescriptionCalls = 0;

	addTrack(): RTCRtpSender {
		throw new Error('Unexpected addTrack call in test');
	}

	createDataChannel(): RTCDataChannel {
		throw new Error('Unexpected createDataChannel call in test');
	}

	async createOffer(): Promise<RTCSessionDescriptionInit> {
		return { type: 'offer', sdp: 'mock-offer' };
	}

	async setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void> {
		this.setLocalDescriptionCalls += 1;
		this.localDescription = description
			? {
					type: description.type ?? 'offer',
					sdp: description.sdp ?? 'mock-offer',
				}
			: { type: 'offer', sdp: 'mock-offer' };
	}

	async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
		this.remoteDescription = description;
	}

	async addIceCandidate(): Promise<void> {}

	async getStats(): Promise<RTCStatsReport> {
		return createStatsReport([]);
	}

	getSenders(): RTCRtpSender[] {
		return [];
	}

	close(): void {}
}

test('getQualitySummary returns expected shape', async () => {
	const manager = new WebRTCManager({ signalUrl: 'ws://localhost', roomId: 'test' });

	const stats = createStatsReport([
		{
			id: 'pair-1',
			type: 'candidate-pair',
			state: 'succeeded',
			currentRoundTripTime: 0.05,
			localCandidateId: 'local-1',
			remoteCandidateId: 'remote-1',
		},
		{
			id: 'local-1',
			type: 'local-candidate',
			candidateType: 'host',
			protocol: 'udp',
		},
		{
			id: 'remote-1',
			type: 'remote-candidate',
			candidateType: 'relay',
			protocol: 'udp',
		},
		{
			id: 'audio-in',
			type: 'inbound-rtp',
			kind: 'audio',
			jitter: 0.02,
			packetsLost: 5,
			packetsReceived: 95,
		},
		{
			id: 'video-in',
			type: 'inbound-rtp',
			kind: 'video',
			framesPerSecond: 30,
			framesDropped: 2,
			frameWidth: 1280,
			frameHeight: 720,
		},
	]);

	const session = {
		pc: { getStats: async () => stats },
		lastStats: undefined,
		lastStatsTime: undefined,
	} as unknown as { pc: { getStats: () => Promise<RTCStatsReport> }; lastStats?: RTCStatsReport };

	(manager as unknown as { peers: Map<string, unknown> }).peers.set('peer-1', session);

	const summary = await manager.getQualitySummary('peer-1');
	if (!summary) throw new Error('Summary missing');

	expect(summary.timestamp).toBeDefined();
	expect(summary.rtt).toBe(50);
	expect(summary.jitter).toBe(20);
	expect(summary.packetLossPercent).toBe(5);
	expect(summary.candidatePair?.usingRelay).toBe(true);
	expect(summary.video?.frameWidth).toBe(1280);
});

test('bitrate calculation uses previous stats snapshot', () => {
	const manager = new WebRTCManager({ signalUrl: 'ws://localhost', roomId: 'test' });
	const now = 2000;
	const originalNow = Date.now;
	Date.now = () => now;

	try {
		const prevStats = createStatsReport([
			{
				id: 'audio-in',
				type: 'inbound-rtp',
				kind: 'audio',
				bytesReceived: 1000,
			},
			{
				id: 'video-out',
				type: 'outbound-rtp',
				kind: 'video',
				bytesSent: 2000,
			},
		]);

		const currentStats = createStatsReport([
			{
				id: 'audio-in',
				type: 'inbound-rtp',
				kind: 'audio',
				bytesReceived: 3000,
			},
			{
				id: 'video-out',
				type: 'outbound-rtp',
				kind: 'video',
				bytesSent: 5000,
			},
		]);

		const session = {
			lastStats: prevStats,
			lastStatsTime: now - 1000,
		} as unknown as { lastStats?: RTCStatsReport; lastStatsTime?: number };

		const summary = (
			manager as unknown as {
				parseStatsToSummary: (stats: RTCStatsReport, session: unknown) => { bitrate?: unknown };
			}
		).parseStatsToSummary(currentStats, session);

		expect(summary.bitrate).toBeDefined();
		const bitrate = summary.bitrate as {
			audio?: { inbound?: number };
			video?: { outbound?: number };
		};
		expect(bitrate.audio?.inbound).toBe(16000);
		expect(bitrate.video?.outbound).toBe(24000);
	} finally {
		Date.now = originalNow;
	}
});

describe('WebRTCManager negotiation', () => {
	let originalRTCPeerConnection: typeof RTCPeerConnection | undefined;

	beforeEach(() => {
		originalRTCPeerConnection = globalThis.RTCPeerConnection;
		Object.defineProperty(globalThis, 'RTCPeerConnection', {
			configurable: true,
			writable: true,
			value: MockRTCPeerConnection,
		});
	});

	afterEach(() => {
		Object.defineProperty(globalThis, 'RTCPeerConnection', {
			configurable: true,
			writable: true,
			value: originalRTCPeerConnection,
		});
	});

	test('onnegotiationneeded skips duplicate offers while unstable or already making one', async () => {
		const manager = new WebRTCManager({ signalUrl: 'ws://localhost', roomId: 'test' });
		const testManager = manager as unknown as {
			peerId: string;
			createPeerSession: (
				remotePeerId: string,
				isOfferer: boolean
			) => Promise<{
				pc: MockRTCPeerConnection;
				hasRemoteDescription: boolean;
				negotiationStarted: boolean;
				makingOffer: boolean;
			}>;
		};

		testManager.peerId = 'peer-self';

		const session = await testManager.createPeerSession('peer-remote', false);
		session.hasRemoteDescription = true;
		session.negotiationStarted = true;

		if (!session.pc.onnegotiationneeded) {
			throw new Error('Expected negotiationneeded handler to be registered');
		}

		session.makingOffer = true;
		await session.pc.onnegotiationneeded(new Event('negotiationneeded'));
		expect(session.pc.setLocalDescriptionCalls).toBe(0);

		session.makingOffer = false;
		session.pc.signalingState = 'have-local-offer';
		await session.pc.onnegotiationneeded(new Event('negotiationneeded'));
		expect(session.pc.setLocalDescriptionCalls).toBe(0);

		session.pc.signalingState = 'stable';
		await session.pc.onnegotiationneeded(new Event('negotiationneeded'));
		expect(session.pc.setLocalDescriptionCalls).toBe(1);

		manager.dispose();
	});
});
