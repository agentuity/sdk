# @agentuity/analytics

Browser analytics for Agentuity applications. Track page views, Web Vitals, custom events, and more.

## Installation

```bash
npm install @agentuity/analytics
```

## Usage

### Auto-init (Drop-in)

Set configuration via server-side injection, then import the beacon:

```html
<script>
  window.__AGENTUITY_ANALYTICS__ = {
    enabled: true,
    orgId: 'your-org-id',
    projectId: 'your-project-id',
  };
</script>
<script type="module" src="/path/to/analytics/beacon.js"></script>
```

Or in a bundler:

```typescript
import '@agentuity/analytics/beacon';
```

### Programmatic

```typescript
import { init, track, identify, flush } from '@agentuity/analytics';

// Initialize
init({
  orgId: 'your-org-id',
  projectId: 'your-project-id',
});

// Track events
track('button_click', { button: 'signup' });

// Identify user
identify('user-123', { email: 'user@example.com' });

// Flush pending events
flush();
```

## Features

- **Page Views** - Automatic tracking with URL, referrer, title
- **Web Vitals** - FCP, LCP, CLS, INP metrics
- **Scroll Depth** - Tracks 25%, 50%, 75%, 100% milestones
- **SPA Navigation** - Tracks route changes in single-page apps
- **Click Tracking** - Via `[data-analytics]` attributes
- **Error Tracking** - JS errors and unhandled rejections
- **Custom Events** - Track any user action

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable tracking |
| `orgId` | string | - | Organization ID |
| `projectId` | string | - | Project ID |
| `isDevmode` | boolean | `false` | Development mode (logs to console) |
| `trackClicks` | boolean | `true` | Track `[data-analytics]` clicks |
| `trackScroll` | boolean | `true` | Track scroll depth |
| `trackWebVitals` | boolean | `true` | Track Core Web Vitals |
| `trackErrors` | boolean | `true` | Track JS errors |
| `trackSPANavigation` | boolean | `true` | Track SPA route changes |
| `sampleRate` | number | `1` | Sampling rate (0-1) |
| `endpoint` | string | `/_agentuity/webanalytics/collect` | Collect endpoint |

## Data Collected

The beacon collects:

- **Page**: URL, path, referrer, title
- **Device**: Screen size, viewport, device pixel ratio, user agent
- **Performance**: TTFB, DOM ready, load time, Web Vitals
- **Engagement**: Scroll depth, time on page
- **Context**: Language, timezone, UTM parameters
- **Geo**: Country, region, city (from IP, cached)

## Privacy

- Query strings are stripped from URLs to prevent sensitive data leakage
- No cookies used (uses localStorage for visitor ID)
- Geo data cached in sessionStorage
- User opt-out supported via `setOptOut(true)`

## Server Integration

The beacon sends data to `/_agentuity/webanalytics/collect` by default. Configure your server to:

1. Inject `window.__AGENTUITY_ANALYTICS__` config
2. Handle POST requests to the collect endpoint

## Framework Support

Works with any frontend framework:

- React
- Vue
- Svelte
- Solid
- Vanilla JS

No framework-specific code required.