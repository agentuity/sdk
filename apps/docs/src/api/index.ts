import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';

import agentCalls from './agent-calls/route';
import agentPulse from './agent-pulse/route';
import aiGateway from './ai-gateway/route';
import chat from './chat/route';
import context from './context/route';
import docQa from './doc-qa/route';
import durableStream from './durable-stream/route';
import evals from './evals/route';
import hello from './hello/route';
import keyValue from './key-value/route';
import modelArena from './model-arena/route';
import objectStorage from './object-storage/route';
import processDocs from './process-docs/route';
import sandbox from './sandbox/route';
import sessions from './sessions/route';
import sseStream from './sse-stream/route';
import streaming from './streaming/route';
import titleGenerator from './title-generator/route';
import vectorStorage from './vector-storage/route';
import websocket from './websocket/route';

const router = new Hono<Env>()
	.route('/agent-calls', agentCalls)
	.route('/agent-pulse', agentPulse)
	.route('/ai-gateway', aiGateway)
	.route('/chat', chat)
	.route('/context', context)
	.route('/doc-qa', docQa)
	.route('/durable-stream', durableStream)
	.route('/evals', evals)
	.route('/hello', hello)
	.route('/key-value', keyValue)
	.route('/model-arena', modelArena)
	.route('/object-storage', objectStorage)
	.route('/process-docs', processDocs)
	.route('/sandbox', sandbox)
	.route('/sessions', sessions)
	.route('/sse-stream', sseStream)
	.route('/streaming', streaming)
	.route('/title-generator', titleGenerator)
	.route('/vector-storage', vectorStorage)
	.route('/websocket', websocket);

export default router;
