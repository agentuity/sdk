import { s, type Infer, ValidationError } from '../src/index.js';

console.log('=== Example 1: Basic parse() usage ===\n');

const userSchema = s.object({
	username: s.string(),
	xp: s.number(),
});

// Extract the inferred type (like zod's z.infer<typeof schema>)
type User = Infer<typeof userSchema>;

// Valid data
try {
	const validUser: User = userSchema.parse({
		username: 'player1',
		xp: 100,
	});
	console.log('✓ Valid user parsed:', validUser);
} catch (error) {
	console.error('✗ Unexpected error:', error);
}

// Invalid data - will throw
try {
	const invalidUser = userSchema.parse({
		username: 'player2',
		xp: 'not-a-number', // Wrong type
	});
	console.log('✗ Should not reach here:', invalidUser);
} catch (error) {
	if (error instanceof ValidationError) {
		console.log('\n✓ Caught ValidationError:');
		console.log('  Message:', error.message);
		console.log('  Issues:', JSON.stringify(error.issues, null, 2));
	}
}

console.log('\n=== Example 2: safeParse() for error handling ===\n');

const emailSchema = s.object({
	email: s.string().describe('Email address'),
	verified: s.boolean().describe('Email verification status'),
});

// Valid data with safeParse
const result1 = emailSchema.safeParse({
	email: 'user@example.com',
	verified: true,
});

if (result1.success) {
	console.log('✓ Email data is valid:', result1.data);
} else {
	console.log('✗ Validation failed:', result1.error.message);
}

// Invalid data with safeParse
const result2 = emailSchema.safeParse({
	email: 'user@example.com',
	verified: 'yes', // Wrong type
});

if (result2.success) {
	console.log('✗ Should not succeed');
} else {
	console.log('✓ Validation failed as expected:');
	console.log('  Error:', result2.error.message);
	console.log('  Issues:', result2.error.issues);
}

console.log('\n=== Example 3: Complex nested validation errors ===\n');

const profileSchema = s.object({
	user: s.object({
		name: s.string(),
		age: s.number(),
		address: s.object({
			street: s.string(),
			city: s.string(),
			zipCode: s.string(),
		}),
	}),
	settings: s.object({
		theme: s.union(s.literal('dark'), s.literal('light')),
		notifications: s.boolean(),
	}),
});

const invalidProfile = {
	user: {
		name: 'John',
		age: 'thirty', // Wrong type
		address: {
			street: 123, // Wrong type
			city: 'Boston',
			zipCode: 12345, // Wrong type
		},
	},
	settings: {
		theme: 'blue', // Not in union
		notifications: 'yes', // Wrong type
	},
};

try {
	profileSchema.parse(invalidProfile);
} catch (error) {
	if (error instanceof ValidationError) {
		console.log('✓ Multiple validation errors caught:');
		console.log(error.message);
		console.log('\nDetailed issues:');
		error.issues.forEach((issue, i) => {
			console.log(`  ${i + 1}. ${JSON.stringify(issue)}`);
		});
	}
}

console.log('\n=== Example 4: Type inference demo ===\n');

const Player = s.object({
	username: s.string(),
	xp: s.number(),
	inventory: s.array(s.string()),
	status: s.union(s.literal('online'), s.literal('offline'), s.literal('away')),
});

// Extract the inferred type
type Player = Infer<typeof Player>;

// TypeScript knows the exact type!
const player: Player = {
	username: 'hero123',
	xp: 9999,
	inventory: ['sword', 'shield', 'potion'],
	status: 'online',
};

console.log('Player type inferred correctly:', player);

// This would cause a TypeScript error:
// const badPlayer: Player = {
//   username: 'bad',
//   xp: 'lots', // TS Error: Type 'string' is not assignable to type 'number'
//   inventory: ['item'],
//   status: 'sleeping' // TS Error: Type '"sleeping"' is not assignable to type union
// };

console.log('\n=== Example 5: Optional and nullable with parse ===\n');

const postSchema = s.object({
	title: s.string(),
	content: s.string(),
	author: s.optional(s.string()).describe('Optional author'),
	publishedAt: s.nullable(s.string()).describe('Nullable publish date'),
});

const post1 = postSchema.parse({
	title: 'Hello World',
	content: 'This is my first post',
	publishedAt: null,
});
console.log('✓ Post without author:', post1);

const post2 = postSchema.parse({
	title: 'Second Post',
	content: 'Another post',
	author: 'John Doe',
	publishedAt: '2025-01-01',
});
console.log('✓ Post with all fields:', post2);

console.log('\n=== Example 6: Array validation with parse ===\n');

const todoListSchema = s.array(
	s.object({
		id: s.number(),
		text: s.string(),
		completed: s.boolean(),
	})
);

try {
	const todos = todoListSchema.parse([
		{ id: 1, text: 'Buy milk', completed: false },
		{ id: 2, text: 'Write code', completed: true },
		{ id: 3, text: 'Test code', completed: 'maybe' }, // Error here
	]);
	console.log('Todos:', todos);
} catch (error) {
	if (error instanceof ValidationError) {
		console.log('✓ Array validation error caught:');
		console.log('  Path to error:', error.issues[0].path);
		console.log('  Message:', error.issues[0].message);
	}
}
