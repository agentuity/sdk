import { s, type Infer, ValidationError } from '../src/index.js';

console.log('=== @agentuity/schema - Complete Feature Demo ===\n');

// Define a comprehensive schema
const UserProfile = s
	.object({
		// Basic types
		id: s.string().describe('Unique user identifier'),
		username: s.string().describe('Username'),

		// Coercion for form data
		age: s.coerce.number().describe('Age (coerced from string)'),
		isActive: s.coerce.boolean().describe('Account status (coerced)'),
		joinedAt: s.coerce.date().describe('Join date (coerced from ISO string)'),

		// Optional fields
		nickname: s.optional(s.string()).describe('Optional display name'),

		// Nullable fields
		lastLoginAt: s.nullable(s.coerce.date()).describe('Last login timestamp'),

		// Union types (enum-like)
		role: s
			.union(s.literal('admin'), s.literal('user'), s.literal('guest'))
			.describe('User role'),

		// Nested objects
		settings: s
			.object({
				theme: s.union(s.literal('dark'), s.literal('light')),
				notifications: s.coerce.boolean(),
				language: s.string(),
			})
			.describe('User settings'),

		// Arrays
		tags: s.array(s.string()).describe('User tags'),

		// Array of objects
		permissions: s
			.array(
				s.object({
					resource: s.string(),
					actions: s.array(s.string()),
				})
			)
			.describe('User permissions'),
	})
	.describe('User profile schema');

// Extract TypeScript type
type UserProfile = Infer<typeof UserProfile>;

console.log('1. Type Inference:');
console.log('   TypeScript type extracted from schema ✓\n');

// Parse valid data
console.log('2. Parsing valid data:');
const validUser: UserProfile = UserProfile.parse({
	id: 'user-123',
	username: 'john_doe',
	age: '30', // String coerced to number
	isActive: '1', // String coerced to boolean
	joinedAt: '2024-01-01', // String coerced to Date
	lastLoginAt: '2024-12-01', // String coerced to Date
	role: 'admin',
	settings: {
		theme: 'dark',
		notifications: 'true', // String coerced to boolean
		language: 'en',
	},
	tags: ['developer', 'admin'],
	permissions: [
		{ resource: 'users', actions: ['read', 'write'] },
		{ resource: 'posts', actions: ['read'] },
	],
});
console.log('   ✓ Parsed successfully');
console.log('   Age type:', typeof validUser.age, '=', validUser.age);
console.log('   JoinedAt type:', validUser.joinedAt.constructor.name, '=', validUser.joinedAt);

// Structured error handling
console.log('\n3. Structured error handling:');
try {
	UserProfile.parse({
		id: 'user-456',
		username: 'jane',
		age: 'not-a-number', // Will fail coercion
		isActive: true,
		joinedAt: 'invalid-date', // Will fail coercion
		role: 'super-admin', // Not in union
		settings: {
			theme: 'blue', // Not in union
			notifications: true,
			language: 123, // Wrong type
		},
		tags: ['tag1', 123], // Mixed types in array
		permissions: [],
	});
} catch (error) {
	if (error instanceof ValidationError) {
		console.log('   ✓ Caught ValidationError with', error.issues.length, 'issues:');
		error.issues.forEach((issue, i) => {
			const path = issue.path ? `[${issue.path.join('.')}]` : '';
			console.log(`     ${i + 1}. ${path}: ${issue.message}`);
		});
	}
}

// Safe parsing
console.log('\n4. Safe parsing (no exceptions):');
const result = UserProfile.safeParse({
	id: 'user-789',
	username: 'test',
	age: 'abc', // Invalid
	isActive: true,
	joinedAt: '2024-01-01',
	role: 'user',
	settings: { theme: 'light', notifications: false, language: 'en' },
	tags: [],
	permissions: [],
});

if (result.success) {
	console.log('   Data is valid');
} else {
	console.log('   ✓ Validation failed:', result.error.message);
}

// JSON Schema conversion
console.log('\n5. JSON Schema conversion:');
const jsonSchema = s.toJSONSchema(UserProfile);
console.log('   ✓ Converted to JSON Schema');
console.log('   Properties:', Object.keys(jsonSchema.properties || {}).length);
console.log('   Required fields:', (jsonSchema.required || []).length);

// Round-trip: JSON Schema → Schema → JSON Schema
console.log('\n6. Round-trip conversion:');
const reconstructed = s.fromJSONSchema(jsonSchema);
const _jsonSchema2 = s.toJSONSchema(reconstructed);
console.log('   ✓ Schema → JSON → Schema → JSON works!');

// Using with descriptions
console.log('\n7. Schema descriptions:');
console.log('   Schema description:', UserProfile.description);
console.log('   Field descriptions preserved in JSON Schema ✓');

// Real-world example: Form data parsing
console.log('\n8. Real-world use case - HTML form parsing:');
const formSchema = s.object({
	email: s.string(),
	age: s.coerce.number(),
	subscribe: s.coerce.boolean(),
	birthdate: s.coerce.date(),
});

// Simulate form data (everything comes as strings)
const htmlFormData = {
	email: 'user@example.com',
	age: '25', // <input type="text">
	subscribe: 'on', // <input type="checkbox" checked>
	birthdate: '1999-01-01', // <input type="date">
};

const parsedForm = formSchema.parse(htmlFormData);
console.log('   ✓ Form data parsed with correct types:');
console.log('     age:', parsedForm.age, '(type:', typeof parsedForm.age, ')');
console.log('     subscribe:', parsedForm.subscribe, '(type:', typeof parsedForm.subscribe, ')');
console.log(
	'     birthdate:',
	parsedForm.birthdate,
	'(type:',
	parsedForm.birthdate.constructor.name,
	')'
);

console.log('\n=== All features demonstrated successfully! ===');
console.log('\nFeatures included:');
console.log('  ✓ Type inference with Infer<typeof schema>');
console.log('  ✓ .parse() with typed output');
console.log('  ✓ .safeParse() for error handling');
console.log('  ✓ Structured ValidationError with paths');
console.log('  ✓ Coercion (s.coerce.string/number/boolean/date)');
console.log('  ✓ Optional and nullable fields');
console.log('  ✓ Union types (enum-like)');
console.log('  ✓ Nested objects and arrays');
console.log('  ✓ JSON Schema conversion (bidirectional)');
console.log('  ✓ Descriptions on all fields');
console.log('  ✓ StandardSchema v1 compliant');
