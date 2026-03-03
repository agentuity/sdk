import { test, expect } from 'bun:test';
import { WebRTCManager } from '../src/webrtc-manager.ts';

type PartialStats = Record<string, unknown> & { id: string; type: string };

function createStatsReport(reports: PartialStats[]): RTCStatsReport {
	const map = new Map<string, PartialStats>();
	for (const report of reports) {
		map.set(report.id, report);
	}
	return map as unknown as RTCStatsReport;
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
