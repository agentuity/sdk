import { createApp } from '@agentuity/runtime';
import eval_ from './src/agent/eval/agent';

export default await createApp({
	agents: [eval_],
});
