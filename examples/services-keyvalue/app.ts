import { createApp } from '@agentuity/runtime';
import keyvalue from './src/agent/keyvalue/agent';

export default await createApp({
	agents: [keyvalue],
});
