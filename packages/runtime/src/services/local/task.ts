import type { Database } from 'bun:sqlite';
import type {
	TaskStorage,
	Task,
	TaskChangelogEntry,
	TaskPriority,
	TaskStatus,
	TaskType,
	CreateTaskParams,
	UpdateTaskParams,
	ListTasksParams,
	ListTasksResult,
	TaskChangelogResult,
} from '@agentuity/core';
import { StructuredError } from '@agentuity/core';
import { now } from './_util';

const TaskTitleRequiredError = StructuredError(
	'TaskTitleRequiredError',
	'Task title is required and must be a non-empty string'
);

const TaskNotFoundError = StructuredError('TaskNotFoundError', 'Task not found');

const TaskAlreadyClosedError = StructuredError(
	'TaskAlreadyClosedError',
	'Task is already closed'
);

type TaskRow = {
	id: string;
	created_at: number;
	updated_at: number;
	title: string;
	description: string | null;
	metadata: string | null;
	priority: TaskPriority;
	parent_id: string | null;
	type: TaskType;
	status: TaskStatus;
	open_date: string | null;
	in_progress_date: string | null;
	closed_date: string | null;
	created_id: string;
	assigned_id: string | null;
	closed_id: string | null;
};

type TaskChangelogRow = {
	id: string;
	created_at: number;
	task_id: string;
	field: string;
	old_value: string | null;
	new_value: string | null;
};

const DEFAULT_LIMIT = 100;

const SORT_FIELDS: Record<string, string> = {
	created_at: 'created_at',
	updated_at: 'updated_at',
	title: 'title',
	priority: 'priority',
	status: 'status',
	type: 'type',
	open_date: 'open_date',
	in_progress_date: 'in_progress_date',
	closed_date: 'closed_date',
};

function generateTaskId(): string {
	return `task_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function generateChangelogId(): string {
	return `taskch_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function toTask(row: TaskRow): Task {
	return {
		id: row.id,
		created_at: new Date(row.created_at).toISOString(),
		updated_at: new Date(row.updated_at).toISOString(),
		title: row.title,
		description: row.description ?? undefined,
		metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
		priority: row.priority,
		parent_id: row.parent_id ?? undefined,
		type: row.type,
		status: row.status,
		open_date: row.open_date ?? undefined,
		in_progress_date: row.in_progress_date ?? undefined,
		closed_date: row.closed_date ?? undefined,
		created_id: row.created_id,
		assigned_id: row.assigned_id ?? undefined,
		closed_id: row.closed_id ?? undefined,
	};
}

function toChangelogEntry(row: TaskChangelogRow): TaskChangelogEntry {
	return {
		id: row.id,
		created_at: new Date(row.created_at).toISOString(),
		task_id: row.task_id,
		field: row.field,
		old_value: row.old_value ?? undefined,
		new_value: row.new_value ?? undefined,
	};
}

export class LocalTaskStorage implements TaskStorage {
	#db: Database;
	#projectPath: string;

	constructor(db: Database, projectPath: string) {
		this.#db = db;
		this.#projectPath = projectPath;
	}

	async create(params: CreateTaskParams): Promise<Task> {
		if (!params?.title?.trim()) {
			throw new TaskTitleRequiredError();
		}

		const id = generateTaskId();
		const timestamp = now();
		const status: TaskStatus = params.status ?? 'open';
		const priority: TaskPriority = params.priority ?? 'none';
		const openDate = status === 'open' ? new Date(timestamp).toISOString() : null;
		const inProgressDate = status === 'in_progress' ? new Date(timestamp).toISOString() : null;
		const closedDate = status === 'closed' ? new Date(timestamp).toISOString() : null;

		const stmt = this.#db.prepare(`
			INSERT INTO task_storage (
				project_path,
				id,
				title,
				description,
				metadata,
				priority,
				parent_id,
				type,
				status,
				open_date,
				in_progress_date,
				closed_date,
				created_id,
				assigned_id,
				closed_id,
				created_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const row: TaskRow = {
			id,
			created_at: timestamp,
			updated_at: timestamp,
			title: params.title,
			description: params.description ?? null,
			metadata: params.metadata ? JSON.stringify(params.metadata) : null,
			priority,
			parent_id: params.parent_id ?? null,
			type: params.type,
			status,
			open_date: openDate,
			in_progress_date: inProgressDate,
			closed_date: closedDate,
			created_id: params.created_id,
			assigned_id: params.assigned_id ?? null,
			closed_id: null,
		};

		stmt.run(
			this.#projectPath,
			row.id,
			row.title,
			row.description,
			row.metadata,
			row.priority,
			row.parent_id,
			row.type,
			row.status,
			row.open_date,
			row.in_progress_date,
			row.closed_date,
			row.created_id,
			row.assigned_id,
			row.closed_id,
			row.created_at,
			row.updated_at
		);

		return toTask(row);
	}

	async get(id: string): Promise<Task | null> {
		const query = this.#db.query(`
			SELECT
				id,
				created_at,
				updated_at,
				title,
				description,
				metadata,
				priority,
				parent_id,
				type,
				status,
				open_date,
				in_progress_date,
				closed_date,
				created_id,
				assigned_id,
				closed_id
			FROM task_storage
			WHERE project_path = ? AND id = ?
		`);

		const row = query.get(this.#projectPath, id) as TaskRow | null;
		if (!row) {
			return null;
		}

		return toTask(row);
	}

	async list(params?: ListTasksParams): Promise<ListTasksResult> {
		const filters: string[] = ['project_path = ?'];
		const values: Array<string | number> = [this.#projectPath];

		if (params?.status) {
			filters.push('status = ?');
			values.push(params.status);
		}
		if (params?.type) {
			filters.push('type = ?');
			values.push(params.type);
		}
		if (params?.priority) {
			filters.push('priority = ?');
			values.push(params.priority);
		}
		if (params?.assigned_id) {
			filters.push('assigned_id = ?');
			values.push(params.assigned_id);
		}
		if (params?.parent_id) {
			filters.push('parent_id = ?');
			values.push(params.parent_id);
		}

		const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
		const sortField =
			params?.sort && SORT_FIELDS[params.sort] ? SORT_FIELDS[params.sort] : 'created_at';
		const sortOrder = params?.order === 'asc' ? 'ASC' : 'DESC';
		const limit = params?.limit ?? DEFAULT_LIMIT;
		const offset = params?.offset ?? 0;

		const totalQuery = this.#db.query(
			`SELECT COUNT(*) as count FROM task_storage ${whereClause}`
		);
		const totalRow = totalQuery.get(...values) as { count: number };

		const query = this.#db.query(`
			SELECT
				id,
				created_at,
				updated_at,
				title,
				description,
				metadata,
				priority,
				parent_id,
				type,
				status,
				open_date,
				in_progress_date,
				closed_date,
				created_id,
				assigned_id,
				closed_id
			FROM task_storage
			${whereClause}
			ORDER BY ${sortField} ${sortOrder}
			LIMIT ? OFFSET ?
		`);

		const rows = query.all(...values, limit, offset) as TaskRow[];

		return {
			tasks: rows.map(toTask),
			total: totalRow.count,
			limit,
			offset,
		};
	}

	async update(id: string, params: UpdateTaskParams): Promise<Task> {
		const updateInTransaction = this.#db.transaction(() => {
			const existingQuery = this.#db.query(`
				SELECT
					id,
					created_at,
					updated_at,
					title,
					description,
					metadata,
					priority,
					parent_id,
					type,
					status,
					open_date,
					in_progress_date,
					closed_date,
					created_id,
					assigned_id,
					closed_id
				FROM task_storage
				WHERE project_path = ? AND id = ?
			`);

			const existing = existingQuery.get(this.#projectPath, id) as TaskRow | null;
			if (!existing) {
				throw new TaskNotFoundError();
			}
			if (params.title !== undefined && !params.title?.trim()) {
				throw new TaskTitleRequiredError();
			}
			const timestamp = now();
			const nowIso = new Date(timestamp).toISOString();

			const updated: TaskRow = {
				...existing,
				title: params.title ?? existing.title,
				description:
					params.description !== undefined ? params.description : existing.description,
				metadata:
					params.metadata !== undefined
						? params.metadata
							? JSON.stringify(params.metadata)
							: null
						: existing.metadata,
				priority: params.priority ?? existing.priority,
				parent_id: params.parent_id !== undefined ? params.parent_id : existing.parent_id,
				type: params.type ?? existing.type,
				status: params.status ?? existing.status,
				assigned_id:
					params.assigned_id !== undefined ? params.assigned_id : existing.assigned_id,
				closed_id: params.closed_id !== undefined ? params.closed_id : existing.closed_id,
				updated_at: timestamp,
			};

			if (params.status && params.status !== existing.status) {
				if (params.status === 'open' && !existing.open_date) {
					updated.open_date = nowIso;
				}
				if (params.status === 'in_progress' && !existing.in_progress_date) {
					updated.in_progress_date = nowIso;
				}
				if (params.status === 'closed' && !existing.closed_date) {
					updated.closed_date = nowIso;
				}
			}

			const changelogEntries: Array<{
				field: string;
				oldValue: string | null;
				newValue: string | null;
			}> = [];

			const compare = (field: string, oldValue: string | null, newValue: string | null) => {
				if (oldValue !== newValue) {
					changelogEntries.push({ field, oldValue, newValue });
				}
			};

			if (params.title !== undefined) {
				compare('title', existing.title, updated.title);
			}
			if (params.description !== undefined) {
				compare('description', existing.description, updated.description);
			}
			if (params.metadata !== undefined) {
				compare('metadata', existing.metadata, updated.metadata);
			}
			if (params.priority !== undefined) {
				compare('priority', existing.priority, updated.priority);
			}
			if (params.parent_id !== undefined) {
				compare('parent_id', existing.parent_id, updated.parent_id);
			}
			if (params.type !== undefined) {
				compare('type', existing.type, updated.type);
			}
			if (params.status !== undefined) {
				compare('status', existing.status, updated.status);
			}
			if (params.assigned_id !== undefined) {
				compare('assigned_id', existing.assigned_id, updated.assigned_id);
			}
			if (params.closed_id !== undefined) {
				compare('closed_id', existing.closed_id, updated.closed_id);
			}

			const updateStmt = this.#db.prepare(`
				UPDATE task_storage
				SET
					title = ?,
					description = ?,
					metadata = ?,
					priority = ?,
					parent_id = ?,
					type = ?,
					status = ?,
					open_date = ?,
					in_progress_date = ?,
					closed_date = ?,
					created_id = ?,
					assigned_id = ?,
					closed_id = ?,
					updated_at = ?
				WHERE project_path = ? AND id = ?
			`);

			updateStmt.run(
				updated.title,
				updated.description,
				updated.metadata,
				updated.priority,
				updated.parent_id,
				updated.type,
				updated.status,
				updated.open_date,
				updated.in_progress_date,
				updated.closed_date,
				updated.created_id,
				updated.assigned_id,
				updated.closed_id,
				updated.updated_at,
				this.#projectPath,
				id
			);

			if (changelogEntries.length > 0) {
				const changelogStmt = this.#db.prepare(`
					INSERT INTO task_changelog_storage (
						project_path,
						id,
						task_id,
						field,
						old_value,
						new_value,
						created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?)
				`);

				for (const entry of changelogEntries) {
					changelogStmt.run(
						this.#projectPath,
						generateChangelogId(),
						id,
						entry.field,
						entry.oldValue,
						entry.newValue,
						timestamp
					);
				}
			}

			return toTask(updated);
		});

		return updateInTransaction.immediate();
	}

	async close(id: string): Promise<Task> {
		const closeInTransaction = this.#db.transaction(() => {
			const existingQuery = this.#db.query(`
				SELECT
					id,
					created_at,
					updated_at,
					title,
					description,
					metadata,
					priority,
					parent_id,
					type,
					status,
					open_date,
					in_progress_date,
					closed_date,
					created_id,
					assigned_id,
					closed_id
				FROM task_storage
				WHERE project_path = ? AND id = ?
			`);

			const existing = existingQuery.get(this.#projectPath, id) as TaskRow | null;
			if (!existing) {
				throw new TaskNotFoundError();
			}

			if (existing.status === 'closed') {
				throw new TaskAlreadyClosedError();
			}
			const timestamp = now();
			const nowIso = new Date(timestamp).toISOString();
			const updated: TaskRow = {
				...existing,
				status: 'closed',
				closed_date: existing.closed_date ?? nowIso,
				updated_at: timestamp,
			};

			const updateStmt = this.#db.prepare(`
				UPDATE task_storage
				SET status = ?, closed_date = ?, updated_at = ?
				WHERE project_path = ? AND id = ?
			`);

			updateStmt.run(
				updated.status,
				updated.closed_date,
				updated.updated_at,
				this.#projectPath,
				id
			);

			if (existing.status !== updated.status) {
				const changelogStmt = this.#db.prepare(`
					INSERT INTO task_changelog_storage (
						project_path,
						id,
						task_id,
						field,
						old_value,
						new_value,
						created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?)
				`);

				changelogStmt.run(
					this.#projectPath,
					generateChangelogId(),
					id,
					'status',
					existing.status,
					updated.status,
					timestamp
				);
			}

			return toTask(updated);
		});

		return closeInTransaction.immediate();
	}

	async changelog(
		id: string,
		params?: { limit?: number; offset?: number }
	): Promise<TaskChangelogResult> {
		const limit = params?.limit ?? DEFAULT_LIMIT;
		const offset = params?.offset ?? 0;

		const totalQuery = this.#db.query(
			`SELECT COUNT(*) as count FROM task_changelog_storage WHERE project_path = ? AND task_id = ?`
		);
		const totalRow = totalQuery.get(this.#projectPath, id) as { count: number };

		const query = this.#db.query(`
			SELECT
				id,
				created_at,
				task_id,
				field,
				old_value,
				new_value
			FROM task_changelog_storage
			WHERE project_path = ? AND task_id = ?
			ORDER BY created_at DESC
			LIMIT ? OFFSET ?
		`);

		const rows = query.all(this.#projectPath, id, limit, offset) as TaskChangelogRow[];

		return {
			changelog: rows.map(toChangelogEntry),
			total: totalRow.count,
			limit,
			offset,
		};
	}
}
