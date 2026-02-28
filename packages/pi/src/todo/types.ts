export interface Todo {
	id: string;
	text: string;
	completed: boolean;
	createdAt: number;
}

export type TodoErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND';

export interface TodoError {
	code: TodoErrorCode;
	message: string;
	field?: 'id' | 'text';
}
