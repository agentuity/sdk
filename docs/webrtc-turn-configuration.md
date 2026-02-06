# TURN Server Configuration Guide

This guide explains how to configure TURN servers for WebRTC connections in your Agentuity applications.

## When is TURN Required?

WebRTC uses ICE (Interactive Connectivity Establishment) to find the best path between peers. The connection types, in order of preference:

1. **Host** - Direct connection (same network)
2. **Server Reflexive (srflx)** - Connection via STUN (works through most NATs)
3. **Relay** - Connection through TURN server (guaranteed to work)

TURN is required when:

- Peers are behind **symmetric NAT** (common in corporate networks)
- **Firewall rules** block UDP traffic
- **Enterprise environments** with restrictive network policies
- **Mobile networks** with carrier-grade NAT

## ICE Server Configuration

### Default Configuration (STUN Only)

By default, WebRTCManager uses public Google STUN servers:

```typescript
const manager = new WebRTCManager({
	signalUrl: 'wss://example.com/signal',
	roomId: 'my-room',
	// Uses default STUN servers
});
```

### Adding TURN Servers

For production use, configure both STUN and TURN:

```typescript
const manager = new WebRTCManager({
	signalUrl: 'wss://example.com/signal',
	roomId: 'my-room',
	iceServers: [
		// STUN server
		{ urls: 'stun:stun.example.com:3478' },

		// TURN server with UDP (fastest, when allowed)
		{
			urls: 'turn:turn.example.com:3478?transport=udp',
			username: 'user',
			credential: 'password',
		},

		// TURN server with TCP (fallback when UDP is blocked)
		{
			urls: 'turn:turn.example.com:3478?transport=tcp',
			username: 'user',
			credential: 'password',
		},

		// TURN over TLS on port 443 (works through most firewalls)
		{
			urls: 'turns:turn.example.com:443?transport=tcp',
			username: 'user',
			credential: 'password',
		},
	],
});
```

### Recommended Configuration for Maximum Compatibility

```typescript
const iceServers: RTCIceServer[] = [
	{ urls: 'stun:stun.example.com:3478' },
	// TURN UDP - best performance
	{
		urls: 'turn:turn.example.com:3478?transport=udp',
		username: credentials.username,
		credential: credentials.password,
	},
	// TURN TCP - fallback
	{
		urls: 'turn:turn.example.com:3478?transport=tcp',
		username: credentials.username,
		credential: credentials.password,
	},
	// TURNS (TLS) on 443 - works through most firewalls
	{
		urls: 'turns:turn.example.com:443?transport=tcp',
		username: credentials.username,
		credential: credentials.password,
	},
];
```

## Credential Management

### Long-Term Credentials

Simple but less secure. Credentials are static:

```typescript
{
  urls: 'turn:turn.example.com:3478',
  username: 'static-user',
  credential: 'static-password',
}
```

### Time-Limited Credentials (Recommended)

Generate short-lived credentials from your server:

```typescript
// Server-side (e.g., in your API)
function generateTurnCredentials(userId: string): { username: string; credential: string } {
	const ttl = 86400; // 24 hours
	const timestamp = Math.floor(Date.now() / 1000) + ttl;
	const username = `${timestamp}:${userId}`;

	// HMAC-SHA1 with your TURN shared secret
	const hmac = crypto.createHmac('sha1', TURN_SECRET);
	hmac.update(username);
	const credential = hmac.digest('base64');

	return { username, credential };
}

// Client-side
const credentials = await fetch('/api/turn-credentials').then((r) => r.json());

const manager = new WebRTCManager({
	signalUrl: 'wss://example.com/signal',
	roomId: 'my-room',
	iceServers: [
		{ urls: 'stun:stun.example.com:3478' },
		{
			urls: 'turn:turn.example.com:3478',
			username: credentials.username,
			credential: credentials.credential,
		},
	],
});
```

## Setting Up coturn

[coturn](https://github.com/coturn/coturn) is the most popular open-source TURN server.

### Basic coturn Configuration

```conf
# /etc/turnserver.conf

# Network
listening-port=3478
tls-listening-port=5349

# Use your actual external IP
external-ip=203.0.113.1

# Domain
realm=example.com

# Authentication
lt-cred-mech
user=username:password

# Or for time-limited credentials
use-auth-secret
static-auth-secret=your-secret-here

# TLS (for TURNS)
cert=/etc/ssl/certs/turn.example.com.pem
pkey=/etc/ssl/private/turn.example.com.key

# Logging
log-file=/var/log/turnserver.log
verbose
```

### Running coturn with Docker

```bash
docker run -d \
  --name coturn \
  --network host \
  coturn/coturn \
  -n \
  --listening-port=3478 \
  --tls-listening-port=5349 \
  --external-ip='$(detect-external-ip)' \
  --realm=example.com \
  --use-auth-secret \
  --static-auth-secret=your-secret-here \
  --cert=/etc/ssl/certs/turn.pem \
  --pkey=/etc/ssl/private/turn.key
```

## Verifying TURN Usage

Use the connection stats API to verify TURN is being used:

```typescript
const summary = await manager.getQualitySummary(peerId);

if (summary?.candidatePair?.usingRelay) {
	console.log('Connection is using TURN relay');
	console.log('Local candidate type:', summary.candidatePair.localType);
	console.log('Remote candidate type:', summary.candidatePair.remoteType);
}
```

## Hosted TURN Services

If you don't want to run your own TURN server:

- [Twilio STUN/TURN](https://www.twilio.com/stun-turn) - Pay-per-use
- [Xirsys](https://xirsys.com/) - TURN-as-a-service
- [Metered](https://www.metered.ca/stun-turn) - STUN/TURN service

## Example: Free TURN Service (Metered Free Tier)

Metered offers a free tier with short-lived credentials. Generate credentials from their API and pass them into `iceServers`:

```typescript
// Example response from your backend (values are placeholders)
const meteredCredentials = {
	urls: [
		'stun:stun.metered.ca:80',
		'turn:turn.metered.ca:80?transport=udp',
		'turn:turn.metered.ca:443?transport=tcp',
		'turns:turn.metered.ca:443?transport=tcp',
	],
	username: 'METERED_USERNAME',
	credential: 'METERED_CREDENTIAL',
};

const manager = new WebRTCManager({
	signalUrl: 'wss://example.com/signal',
	roomId: 'my-room',
	iceServers: [
		{ urls: 'stun:stun.l.google.com:19302' },
		{
			urls: meteredCredentials.urls,
			username: meteredCredentials.username,
			credential: meteredCredentials.credential,
		},
	],
});
```

> Note: Free tiers are great for development and testing. For production, ensure you understand the provider's limits and SLAs.

## Example: Twilio / Xirsys TURN Credentials

Twilio and Xirsys provide time-limited ICE server lists via their APIs. Fetch credentials from your backend and pass through:

```typescript
// Backend returns provider-issued ICE servers
const { iceServers } = await fetch('/api/turn-credentials').then((r) => r.json());

const manager = new WebRTCManager({
	signalUrl: 'wss://example.com/signal',
	roomId: 'my-room',
	iceServers,
});
```

## Troubleshooting

### Connection Fails in Corporate Networks

1. Ensure TURNS on port 443 is configured
2. Check that your TURN server allows TCP transport
3. Verify TLS certificates are valid

### High Latency When Using TURN

- TURN adds latency by design (relay through server)
- Ensure TURN server is geographically close to users
- Consider deploying multiple TURN servers in different regions

### Credentials Rejected

- For time-limited credentials, ensure server time is synchronized
- Verify the HMAC secret matches between server and coturn
- Check that credentials haven't expired

### Testing TURN Connectivity

Use [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) to test your TURN server configuration before deploying.
