import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';

import agentCalls from './agent-calls/route';
import agentPulse from './agent-pulse/route';
import aiGateway from './ai-gateway/route';
import chat from './chat/route';
import context from './context/route';
import database from './database/route';
import docQa from './doc-qa/route';
import durableStream from './durable-stream/route';
import email from './email/route';
import hello from './hello/route';
import keyValue from './key-value/route';
import modelArena from './model-arena/route';
import objectStorage from './object-storage/route';
import processDocs from './process-docs/route';
import queue from './queue/route';
import sandbox from './sandbox/route';
import schedules from './schedules/route';
import sessions from './sessions/route';
import sseStream from './sse-stream/route';
import streaming from './streaming/route';
import titleGenerator from './title-generator/route';
import vectorStorage from './vector-storage/route';
import webrtc from './webrtc/route';
import websocket from './websocket/route';

const router = new Hono<Env>()
	.route('/agent-calls', agentCalls)
	.route('/agent-pulse', agentPulse)
	.route('/ai-gateway', aiGateway)
	.route('/chat', chat)
	.route('/context', context)
	.route('/database', database)
	.route('/doc-qa', docQa)
	.route('/durable-stream', durableStream)
	.route('/email', email)
	.route('/hello', hello)
	.route('/key-value', keyValue)
	.route('/model-arena', modelArena)
	.route('/object-storage', objectStorage)
	.route('/process-docs', processDocs)
	.route('/queue', queue)
	.route('/sandbox', sandbox)
	.route('/schedules', schedules)
	.route('/sessions', sessions)
	.route('/sse-stream', sseStream)
	.route('/streaming', streaming)
	.route('/title-generator', titleGenerator)
	.route('/vector-storage', vectorStorage)
	.route('/webrtc', webrtc)
	.route('/websocket', websocket);

export default router;
