import agentPulse from './agent_pulse/agent';
import chat from './chat/agent';
import context from './context/agent';
import database from './database/agent';
import docProcessing from './doc_processing/agent';
import docQa from './doc_qa/agent';
import email from './email/agent';
import hello from './hello/agent';
import kv from './kv/agent';
import modelArena from './model-arena/agent';
import objectstore from './objectstore/agent';
import queue from './queue/agent';
import sseStream from './sse-stream/agent';
import textProcessor from './text-processor/agent';
import vector from './vector/agent';
import websocket from './websocket/agent';

export default [
	agentPulse,
	chat,
	context,
	database,
	docProcessing,
	docQa,
	email,
	hello,
	kv,
	modelArena,
	objectstore,
	queue,
	sseStream,
	textProcessor,
	vector,
	websocket,
];
