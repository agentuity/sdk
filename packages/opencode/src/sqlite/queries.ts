export const QUERIES = {
	CHECK_TABLES:
		"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('session', 'message', 'part', 'todo')",

	GET_SESSION: 'SELECT * FROM session WHERE id = ?',
	GET_CHILD_SESSIONS: 'SELECT * FROM session WHERE parent_id = ? ORDER BY time_created DESC',
	GET_SESSIONS_BY_PROJECT: 'SELECT * FROM session WHERE project_id = ? ORDER BY time_created DESC',
	GET_DESCENDANT_SESSIONS: `WITH RECURSIVE descendants AS (
		SELECT * FROM session WHERE parent_id = ?
		UNION ALL
		SELECT s.* FROM session s JOIN descendants d ON s.parent_id = d.id
	) SELECT * FROM descendants ORDER BY time_created DESC`,

	GET_MESSAGES:
		'SELECT * FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ? OFFSET ?',
	GET_LATEST_MESSAGE:
		'SELECT * FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT 1',
	GET_MESSAGE_COUNT: 'SELECT COUNT(*) as count FROM message WHERE session_id = ?',

	GET_ACTIVE_TOOLS: `SELECT * FROM part WHERE session_id = ?
		AND json_valid(data)
		AND json_extract(data, '$.type') IN ('tool', 'tool-invocation') 
		AND json_extract(data, '$.state.status') IN ('pending', 'running')
		ORDER BY time_created DESC`,
	GET_TOOL_HISTORY: `SELECT * FROM part WHERE session_id = ?
		AND json_valid(data)
		AND json_extract(data, '$.type') IN ('tool', 'tool-invocation')
		ORDER BY time_created DESC LIMIT ?`,
	GET_TEXT_PARTS: `SELECT * FROM part WHERE session_id = ?
		AND json_valid(data)
		AND json_extract(data, '$.type') = 'text'
		ORDER BY time_created DESC LIMIT ?`,

	GET_TODOS: 'SELECT * FROM todo WHERE session_id = ? ORDER BY position ASC',

	GET_SESSION_COST: `SELECT 
		COALESCE(SUM(json_extract(data, '$.cost')), 0) as total_cost,
		COALESCE(SUM(json_extract(data, '$.tokens.total')), 0) as total_tokens,
		COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as input_tokens,
		COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as output_tokens,
		COALESCE(SUM(json_extract(data, '$.tokens.reasoning')), 0) as reasoning_tokens,
		COALESCE(SUM(json_extract(data, '$.tokens.cache.read')), 0) as cache_read,
		COALESCE(SUM(json_extract(data, '$.tokens.cache.write')), 0) as cache_write,
		COUNT(*) as message_count
		FROM message WHERE session_id = ? AND json_valid(data) AND json_extract(data, '$.role') = 'assistant'`,

	SEARCH_SESSIONS: `SELECT id, project_id, parent_id, slug, directory, title, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, time_created, time_updated, time_compacting, time_archived FROM session WHERE title LIKE ? COLLATE NOCASE ORDER BY time_updated DESC`,

	SEARCH_SESSIONS_LIMITED: `SELECT id, project_id, parent_id, slug, directory, title, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, time_created, time_updated, time_compacting, time_archived FROM session WHERE title LIKE ? COLLATE NOCASE ORDER BY time_updated DESC LIMIT ?`,
} as const;
