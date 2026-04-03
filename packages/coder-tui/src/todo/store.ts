import type { Todo, TodoError, TodoErrorCode } from './types.ts';

const store = new Map<string, Todo>();

function makeTodoError(code: TodoErrorCode, message: string, field?: 'id' | 'text'): TodoError {
	const error: TodoError = { code, message };
	if (field !== undefined) {
		error.field = field;
	}
	return error;
}

export function createTodo(text: string): Todo {
	const trimmed = text.trim();
	if (!trimmed) {
		throw makeTodoError('VALIDATION_ERROR', 'text must not be empty', 'text');
	}
	const todo: Todo = {
		id: crypto.randomUUID(),
		text: trimmed,
		completed: false,
		createdAt: Date.now(),
	};
	store.set(todo.id, todo);
	return todo;
}

export function listTodos(): Todo[] {
	return Array.from(store.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function completeTodo(id: string): Todo {
	const todo = store.get(id);
	if (!todo) {
		throw makeTodoError('NOT_FOUND', `todo with id '${id}' not found`, 'id');
	}
	const updated: Todo = { ...todo, completed: true };
	store.set(id, updated);
	return updated;
}

export function deleteTodo(id: string): Todo {
	const todo = store.get(id);
	if (!todo) {
		throw makeTodoError('NOT_FOUND', `todo with id '${id}' not found`, 'id');
	}
	store.delete(id);
	return todo;
}
