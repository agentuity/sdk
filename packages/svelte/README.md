# @agentuity/svelte

Svelte integration for Agentuity SDK.

## Installation

```bash
npm install @agentuity/svelte svelte
```

## Usage

### Initialize in your app

```svelte
<script>
  import { initAgentuity } from '@agentuity/svelte';
  import { onMount } from 'svelte';

  onMount(() => {
    initAgentuity({ baseUrl: 'http://localhost:3500' });
  });
</script>
```

### Create an API client

```typescript
import { createAPIClient } from '@agentuity/svelte';

const api = createAPIClient();

// Make type-safe API calls
const result = await api.hello.post({ name: 'World' });
```

### Authentication

```typescript
import { setAuthHeader } from '@agentuity/svelte';

// On login
setAuthHeader('Bearer token123');

// On logout
setAuthHeader(null);
```

## License

Apache-2.0
