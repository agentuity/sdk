# Workbench Debug Logging

The workbench supports debug logging to help troubleshoot issues with agent selection, API calls, and Monaco editor behavior.

## Enable Debug Logging

To enable debug logging in the workbench, set the localStorage variable in your browser's developer console:

```javascript
localStorage.setItem('AGENTUITY_LOG_LEVEL', 'debug');
```

Then refresh the page. You'll now see detailed debug logs in the browser console for:

- Agent selection and dropdown behavior
- API request payloads and responses
- Monaco editor value changes
- Form submission and validation
- Base URL configuration

## Log Levels

The logger supports multiple log levels:

- `debug` - Most verbose, includes all debug information
- `info` - General information messages
- `warn` - Warning messages
- `error` - Error messages only

Set the level using:

```javascript
localStorage.setItem('AGENTUITY_LOG_LEVEL', 'info'); // or 'warn', 'error'
```

## Disable Logging

To disable logging completely:

```javascript
localStorage.removeItem('AGENTUITY_LOG_LEVEL');
```

## Using the Logger in Components

The `useLogger` hook can be used in any workbench component:

```typescript
import { useLogger } from '@agentuity/workbench';

function MyComponent() {
	const logger = useLogger('MyComponent');

	logger.debug('Debug message');
	logger.info('Info message');
	logger.warn('Warning message');
	logger.error('Error message');
}
```

The logger automatically checks localStorage and only logs when the appropriate level is set.
