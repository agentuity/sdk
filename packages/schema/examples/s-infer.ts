import { s } from '../src/index.js';

console.log('=== Using s.infer (like z.infer in zod) ===\n');

// Example 1: Basic usage with s.infer
console.log('1. Basic s.infer usage:');

const Player = s.object({
	username: s.string(),
	xp: s.number(),
	level: s.number(),
});

// Extract type using s.infer (like zod's z.infer)
type Player = s.infer<typeof Player>;

const player: Player = {
	username: 'hero123',
	xp: 9999,
	level: 50,
};

console.log('  ✓ Type extracted with s.infer<typeof Player>');
console.log('  Player:', player);

// Example 2: Complex nested types
console.log('\n2. Complex nested types:');

const UserProfile = s.object({
	id: s.string(),
	name: s.string(),
	email: s.string(),
	age: s.coerce.number(),
	role: s.union(s.literal('admin'), s.literal('user'), s.literal('guest')),
	settings: s.object({
		theme: s.union(s.literal('dark'), s.literal('light')),
		notifications: s.boolean(),
	}),
	tags: s.array(s.string()),
	metadata: s.nullable(
		s.object({
			lastLogin: s.coerce.date(),
		})
	),
});

// Use s.infer to extract the type
type UserProfile = s.infer<typeof UserProfile>;

const user: UserProfile = {
	id: 'user-123',
	name: 'John Doe',
	email: 'john@example.com',
	age: 30,
	role: 'admin',
	settings: {
		theme: 'dark',
		notifications: true,
	},
	tags: ['developer', 'admin'],
	metadata: {
		lastLogin: new Date(),
	},
};

console.log('  ✓ Complex type extracted with s.infer');
console.log('  User role:', user.role);
console.log('  Settings:', user.settings);

// Example 3: Array types
console.log('\n3. Array types:');

const TodoList = s.array(
	s.object({
		id: s.number(),
		text: s.string(),
		completed: s.boolean(),
	})
);

type TodoList = s.infer<typeof TodoList>;

const todos: TodoList = [
	{ id: 1, text: 'Learn schema', completed: true },
	{ id: 2, text: 'Build app', completed: false },
];

console.log('  ✓ Array type extracted with s.infer');
console.log('  Todos:', todos.length, 'items');

// Example 4: Optional and nullable
console.log('\n4. Optional and nullable fields:');

const BlogPost = s.object({
	title: s.string(),
	content: s.string(),
	author: s.optional(s.string()),
	publishedAt: s.nullable(s.coerce.date()),
});

type BlogPost = s.infer<typeof BlogPost>;

const post: BlogPost = {
	title: 'Hello World',
	content: 'This is my first post',
	publishedAt: null,
};

console.log('  ✓ Optional/nullable types work correctly');
console.log('  Post has author?', 'author' in post);

// Example 5: Using with parse
console.log('\n5. Type-safe parsing:');

const FormData = s.object({
	name: s.string(),
	age: s.coerce.number(),
	email: s.string(),
});

type FormData = s.infer<typeof FormData>;

const formData: FormData = FormData.parse({
	name: 'Jane',
	age: '25', // Will be coerced to number
	email: 'jane@example.com',
});

console.log('  ✓ Parse returns type-safe data');
console.log('  Form data age type:', typeof formData.age, '=', formData.age);

// Example 6: Comparison with Infer import
console.log('\n6. Both methods work:');

// Method 1: Import Infer type
import type { Infer } from '../src/index.js';
type Method1 = Infer<typeof Player>;

// Method 2: Use s.infer (recommended, like zod)
type Method2 = s.infer<typeof Player>;

// Both are equivalent!
const _player1: Method1 = { username: 'test1', xp: 100, level: 1 };
const _player2: Method2 = { username: 'test2', xp: 200, level: 2 };

console.log('  ✓ Both Infer<typeof> and s.infer<typeof> work');
console.log('  Recommended: s.infer<typeof schema> (like zod)');

console.log('\n=== s.infer works perfectly! ===');
