# WebRTC Architecture Guide

This guide explains the WebRTC architecture options and when to use each approach.

## Current Architecture: Mesh Networking

The Agentuity SDK uses **mesh networking** for WebRTC connections:

```
     Peer A
    /      \
   /        \
Peer B ---- Peer C
```

Each peer maintains a direct RTCPeerConnection to every other peer in the room.

### How It Works

1. **Signaling Server** (WebRTCRoomManager) handles room membership and message relay
2. **WebRTCManager** creates one RTCPeerConnection per remote peer
3. Each peer sends their media/data directly to all other peers
4. Perfect negotiation handles SDP offer/answer collisions

### Pros

- **Simple architecture** - No media server needed
- **Low latency** - Direct peer-to-peer connections
- **Privacy** - Media never touches a central server
- **Cost effective** - Only signaling server required

### Cons

- **O(N²) connections** - Each peer connects to all others
- **Bandwidth scales poorly** - Each peer uploads N-1 copies of their stream
- **CPU intensive** - Encoding happens once per peer
- **Unreliable for mobile** - Limited uplink bandwidth

### Recommended Limits

| Scenario            | Max Peers |
| ------------------- | --------- |
| Audio only          | 8-10      |
| Video (low quality) | 4-6       |
| Video (HD)          | 3-4       |
| Mobile devices      | 2-3       |

## When to Consider an SFU

A **Selective Forwarding Unit (SFU)** is a media server that receives streams from each peer and selectively forwards them:

```
     Peer A
        |
        v
    [  SFU  ]
     /     \
    v       v
Peer B    Peer C
```

### SFU Benefits

- **O(N) connections** - Each peer connects only to the SFU
- **Bandwidth efficient** - Each peer uploads once, SFU distributes
- **Scalable** - Supports 50+ participants
- **Adaptive bitrate** - SFU can select different quality levels
- **Server-side recording** - Easy to record at the SFU
- **Simulcast support** - Peers send multiple quality levels

### SFU Drawbacks

- **Added latency** - Extra hop through the server
- **Server costs** - Media servers require significant resources
- **Complexity** - More infrastructure to manage
- **Privacy concerns** - Media passes through server

### When to Use SFU

Consider an SFU when you need:

- More than 4-6 participants regularly
- Mobile client support with unreliable connections
- Server-side recording or transcription
- Bandwidth adaptation based on network conditions
- Large-scale webinars or broadcasts

## SFU Options

### Open Source

- **[mediasoup](https://mediasoup.org/)** - Highly performant, Node.js based
- **[Janus](https://janus.conf.meetecho.com/)** - Versatile, plugin-based
- **[Pion](https://pion.ly/)** - Go-based, modular

### Commercial

- **[LiveKit](https://livekit.io/)** - Open-source SFU with cloud option
- **[Daily.co](https://www.daily.co/)** - Fully managed WebRTC
- **[Twilio Video](https://www.twilio.com/video)** - Enterprise-grade

## Migrating from Mesh to SFU

If you outgrow mesh networking, the migration path involves:

1. **Signaling changes** - Peers negotiate with SFU, not each other
2. **Track model** - Change from peer-to-peer to publish/subscribe
3. **Quality selection** - SFU handles bandwidth adaptation

The Agentuity SDK's track abstraction and stats APIs remain useful:

```typescript
// Current mesh approach
const manager = new WebRTCManager({
	signalUrl: 'wss://example.com/signal',
	roomId: 'my-room',
});

// Future SFU approach (conceptual)
const manager = new SFUManager({
	sfuUrl: 'wss://sfu.example.com/room/my-room',
	token: 'auth-token',
});

// Same APIs work for both:
await manager.startScreenShare();
const stats = await manager.getQualitySummary(trackId);
manager.startRecording('local');
```

## Hybrid Approaches

For flexibility, consider:

### MCU for Recording + Mesh for Live

- Use mesh for low-latency live communication
- Connect an MCU (Multipoint Control Unit) for server-side recording/compositing

### SFU with Cascading

- Deploy SFUs in multiple regions
- Cascade media between SFUs for global scale

## Summary

| Feature                   | Mesh                 | SFU                     |
| ------------------------- | -------------------- | ----------------------- |
| Max participants          | 4-6                  | 50+                     |
| Server cost               | Low (signaling only) | High (media processing) |
| Latency                   | Lowest               | Low-Medium              |
| Bandwidth efficiency      | Poor                 | Good                    |
| Server-side features      | Limited              | Full (recording, etc.)  |
| Implementation complexity | Simple               | Moderate-High           |

**Start with mesh** (current SDK) for small groups. Migrate to SFU when you consistently need more than 4-6 participants or require server-side features like recording and transcription.
