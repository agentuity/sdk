# WebRTC Scaling Guide: Mesh vs SFU

This guide explains when to use a mesh topology versus an SFU (Selective Forwarding Unit) for WebRTC calls, and how to scale Agentuity-based apps beyond small rooms.

## Mesh Topology (Peer-to-Peer)

**How it works:** every participant sends media directly to every other participant.

**Pros**

- Simple to set up (no media server required)
- Lowest latency for small rooms
- Works well for 2–4 participants

**Cons**

- Upload bandwidth grows with each peer
- CPU usage grows with each peer (encoding multiple streams)
- Unreliable in larger rooms or constrained networks

## SFU Topology (Selective Forwarding Unit)

**How it works:** each participant sends a single stream to a server (SFU) which forwards it to other participants.

**Pros**

- Upload bandwidth stays constant per peer
- Lower CPU usage on clients (one encode)
- Better scaling for 5+ participants
- Server can manage bandwidth, simulcast, and quality tiers

**Cons**

- Requires operating or integrating a media server
- Slightly higher latency (one extra hop)
- Adds infrastructure complexity

## When to Use an SFU

As a rule of thumb, consider an SFU when **5+ peers** join the same room or when you need:

- Large rooms (webinars, classrooms, all-hands)
- Mobile or low-bandwidth participants
- Better quality control (simulcast / adaptive bitrate)
- Recording at the server side

For 2–4 participants, a mesh is often simpler and performant enough.

## Integrating Cloudflare Calls (SFU)

Cloudflare Calls provides a managed SFU you can use to scale beyond mesh.

High-level steps:

1. **Create a Calls application** in Cloudflare and obtain API credentials.
2. **Create a session** on your backend and exchange tokens with clients.
3. **Join the SFU** using the Calls WebRTC endpoint and ICE server list.
4. **Publish / subscribe** to media tracks based on your app needs.

> Tip: Use your backend as the source of truth for room membership and token issuance.

## Decision Matrix

| Room Size | Topology | Why                            |
| --------- | -------- | ------------------------------ |
| 1–2 peers | Mesh     | Lowest latency, minimal setup  |
| 3–4 peers | Mesh     | Still manageable bandwidth/CPU |
| 5–8 peers | SFU      | Upload/CPU starts to spike     |
| 9+ peers  | SFU      | Mesh becomes impractical       |

## Migration Strategy

If you start with mesh and later need SFU:

1. Keep signaling the same (room IDs, peer state)
2. Swap media transport to SFU for rooms above a threshold
3. Fall back to mesh for small rooms to minimize cost

This hybrid approach lets you scale gradually without a full rewrite.
