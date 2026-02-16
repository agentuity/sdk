import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import { OpenCodeDBReader } from '../src/sqlite';

type TestContext = {
	db: Database;
	reader: OpenCodeDBReader;
	dbPath: string;
};

function createSchema(db: Database): void {
	db.run(`
		CREATE TABLE session (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			parent_id TEXT,
			slug TEXT NOT NULL,
			directory TEXT NOT NULL,
			title TEXT NOT NULL,
			version TEXT NOT NULL,
			share_url TEXT,
			summary_additions INTEGER,
			summary_deletions INTEGER,
			summary_files INTEGER,
			summary_diffs TEXT,
			time_created INTEGER NOT NULL,
			time_updated INTEGER NOT NULL,
			time_compacting INTEGER,
			time_archived INTEGER
		)
	`);

	db.run(`
		CREATE TABLE message (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			time_created INTEGER NOT NULL,
			time_updated INTEGER NOT NULL,
			data TEXT NOT NULL
		)
	`);

	db.run(`
		CREATE TABLE part (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL,
			session_id TEXT NOT NULL,
			time_created INTEGER NOT NULL,
			time_updated INTEGER NOT NULL,
			data TEXT NOT NULL
		)
	`);

	db.run(`
		CREATE TABLE todo (
			session_id TEXT NOT NULL,
			content TEXT NOT NULL,
			status TEXT NOT NULL,
			priority TEXT NOT NULL,
			position INTEGER NOT NULL,
			PRIMARY KEY (session_id, position)
		)
	`);
}

function seedData(db: Database): void {
	const now = Date.now();
	db.run(
		`INSERT INTO session (
			id, project_id, parent_id, slug, directory, title, version, share_url,
			summary_additions, summary_deletions, summary_files, summary_diffs,
			time_created, time_updated, time_compacting, time_archived
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			'session-root',
			'project-1',
			null,
			'root',
			'/repo',
			'Root Session',
			'1.2.0',
			null,
			10,
			5,
			2,
			JSON.stringify([{ file: 'a.ts' }]),
			now - 5000,
			now - 3000,
			null,
			null,
		]
	);

	db.run(
		`INSERT INTO session (
			id, project_id, parent_id, slug, directory, title, version, share_url,
			summary_additions, summary_deletions, summary_files, summary_diffs,
			time_created, time_updated, time_compacting, time_archived
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			'session-child',
			'project-1',
			'session-root',
			'child',
			'/repo',
			'Child Session',
			'1.2.0',
			null,
			null,
			null,
			null,
			null,
			now - 4000,
			now - 2000,
			null,
			null,
		]
	);

	db.run(
		`INSERT INTO session (
			id, project_id, parent_id, slug, directory, title, version, share_url,
			summary_additions, summary_deletions, summary_files, summary_diffs,
			time_created, time_updated, time_compacting, time_archived
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			'session-grandchild',
			'project-1',
			'session-child',
			'grandchild',
			'/repo',
			'Grandchild Session',
			'1.2.0',
			null,
			null,
			null,
			null,
			null,
			now - 3500,
			now - 1500,
			null,
			null,
		]
	);

	const assistantMessage = {
		role: 'assistant',
		agent: 'architect',
		model: 'openai/gpt-5.2-codex',
		cost: 1.23,
		tokens: {
			total: 120,
			input: 50,
			output: 70,
			reasoning: 10,
			cache: { read: 3, write: 2 },
		},
	};

	const userMessage = {
		role: 'user',
	};

	db.run(
		'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)',
		['message-1', 'session-root', now - 4500, now - 4400, JSON.stringify(userMessage)]
	);

	db.run(
		'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)',
		['message-2', 'session-root', now - 4300, now - 4200, JSON.stringify(assistantMessage)]
	);

	db.run(
		'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)',
		['message-bad', 'session-root', now - 4100, now - 4000, '{bad json']
	);

	const toolRunning = {
		type: 'tool',
		tool: 'search',
		callID: 'call-1',
		state: {
			status: 'running',
			input: { query: 'agents' },
			timeStarted: now - 4300,
		},
	};

	const toolCompleted = {
		type: 'tool',
		tool: 'search',
		callID: 'call-2',
		state: {
			status: 'completed',
			input: { query: 'sqlite' },
			output: { ok: true },
			timeStarted: now - 4200,
			timeEnded: now - 4100,
		},
	};

	const textPart = {
		type: 'text',
		text: 'Hello from OpenCode',
	};

	db.run(
		'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)',
		['part-1', 'message-2', 'session-root', now - 4290, now - 4290, JSON.stringify(toolRunning)]
	);

	db.run(
		'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)',
		['part-2', 'message-2', 'session-root', now - 4190, now - 4190, JSON.stringify(toolCompleted)]
	);

	db.run(
		'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)',
		['part-3', 'message-2', 'session-root', now - 4180, now - 4180, JSON.stringify(textPart)]
	);

	// Add a message with cost data to the child session for dashboard tests
	const childAssistantMessage = {
		role: 'assistant',
		agent: 'builder',
		model: 'anthropic/claude-opus-4-6',
		cost: 0.45,
		tokens: {
			total: 80,
			input: 30,
			output: 50,
			reasoning: 5,
			cache: { read: 1, write: 1 },
		},
	};

	db.run(
		'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)',
		[
			'message-child-1',
			'session-child',
			now - 3800,
			now - 3700,
			JSON.stringify(childAssistantMessage),
		]
	);

	db.run(
		'INSERT INTO todo (session_id, content, status, priority, position) VALUES (?, ?, ?, ?, ?)',
		['session-root', 'Finish schema', 'pending', 'high', 1]
	);

	db.run(
		'INSERT INTO todo (session_id, content, status, priority, position) VALUES (?, ?, ?, ?, ?)',
		['session-root', 'Run tests', 'completed', 'medium', 2]
	);
}

function createContext(): TestContext {
	const dbPath = `file:opencode-test-${randomUUID()}?mode=memory&cache=shared`;
	const db = new Database(dbPath);
	createSchema(db);
	seedData(db);
	const reader = new OpenCodeDBReader({ dbPath });
	return { db, reader, dbPath };
}

describe('OpenCodeDBReader', () => {
	let ctx: TestContext;

	beforeEach(() => {
		ctx = createContext();
	});

	afterEach(() => {
		ctx.reader.close();
		ctx.db.close();
	});

	it('reports unavailable when DB path is missing', () => {
		const reader = new OpenCodeDBReader({ dbPath: '/tmp/opencode/missing.db' });
		expect(reader.isAvailable()).toBe(false);
		expect(reader.open()).toBe(false);
	});

	it('opens database and reads sessions', () => {
		expect(ctx.reader.open()).toBe(true);
		const session = ctx.reader.getSession('session-root');
		expect(session?.title).toBe('Root Session');
		expect(session?.summary?.files).toBe(2);
	});

	it('returns child sessions in a tree', () => {
		ctx.reader.open();
		const tree = ctx.reader.getSessionTree('session-root');
		expect(tree.children.length).toBe(1);
		expect(tree.children[0].children.length).toBe(1);
		expect(tree.messageCount).toBeGreaterThan(0);
		expect(tree.activeToolCount).toBe(1);
	});

	it('reads messages with pagination and latest message', () => {
		ctx.reader.open();
		const messages = ctx.reader.getMessages('session-root', { limit: 2, offset: 0 });
		expect(messages.length).toBe(2);
		const latest = ctx.reader.getLatestMessage('session-root');
		expect(latest?.id).toBe('message-bad');
	});

	it('handles corrupted JSON gracefully', () => {
		ctx.reader.open();
		const messages = ctx.reader.getMessages('session-root');
		const bad = messages.find((msg) => msg.id === 'message-bad');
		expect(bad?.role).toBe('unknown');
	});

	it('aggregates session cost and tokens', () => {
		ctx.reader.open();
		const cost = ctx.reader.getSessionCost('session-root');
		expect(cost.totalCost).toBeCloseTo(1.23);
		expect(cost.totalTokens).toBe(120);
		expect(cost.messageCount).toBe(1);
	});

	it('extracts tool calls and text parts', () => {
		ctx.reader.open();
		const activeTools = ctx.reader.getActiveToolCalls('session-root');
		expect(activeTools.length).toBe(1);
		expect(activeTools[0].tool).toBe('search');

		const toolHistory = ctx.reader.getToolCallHistory('session-root');
		expect(toolHistory.length).toBeGreaterThanOrEqual(2);

		const textParts = ctx.reader.getTextParts('session-root');
		expect(textParts[0].text).toBe('Hello from OpenCode');
	});

	it('returns todos and status', () => {
		ctx.reader.open();
		const todos = ctx.reader.getTodos('session-root');
		expect(todos.length).toBe(2);

		const status = ctx.reader.getSessionStatus('session-root');
		expect(status.status).toBe('active');
	});

	it('returns dashboard with total cost', () => {
		ctx.reader.open();
		const dashboard = ctx.reader.getSessionDashboard('session-root');
		expect(dashboard.sessions.length).toBe(1);
		// Dashboard aggregates costs across child sessions (child has $0.45)
		expect(dashboard.totalCost).toBeCloseTo(0.45);
	});

	it('fails schema validation when tables are missing', () => {
		const dbPath = `file:opencode-missing-${randomUUID()}?mode=memory&cache=shared`;
		const db = new Database(dbPath);
		db.run(
			'CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, slug TEXT, directory TEXT, title TEXT, version TEXT, time_created INTEGER, time_updated INTEGER)'
		);

		const reader = new OpenCodeDBReader({ dbPath });
		expect(reader.open()).toBe(false);
		reader.close();
		db.close();
	});
});
