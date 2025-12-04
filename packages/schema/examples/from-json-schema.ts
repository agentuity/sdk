import { s } from '../src/index.js';

console.log('=== Test 1: Round-trip conversion ===\n');

// Create a schema
const userSchema = s
	.object({
		id: s.string().describe('User ID'),
		name: s.string().describe('Full name'),
		email: s.string().describe('Email address'),
		age: s.number().describe('Age in years'),
		role: s
			.union(s.literal('admin'), s.literal('user'), s.literal('guest'))
			.describe('User role'),
		isActive: s.boolean().describe('Account status'),
		metadata: s
			.nullable(
				s.object({
					lastLogin: s.string(),
					preferences: s.object({
						theme: s.string(),
						notifications: s.boolean(),
					}),
				})
			)
			.describe('User metadata'),
		tags: s.array(s.string()).describe('User tags'),
		nickname: s.optional(s.string()).describe('Optional nickname'),
	})
	.describe('User schema');

// Convert to JSON Schema
const jsonSchema = s.toJSONSchema(userSchema);
console.log('Original JSON Schema:');
console.log(JSON.stringify(jsonSchema, null, 2));

// Convert back to our schema
const reconstructedSchema = s.fromJSONSchema(jsonSchema);

// Convert the reconstructed schema back to JSON Schema to verify
const jsonSchema2 = s.toJSONSchema(reconstructedSchema);
console.log('\nReconstructed JSON Schema:');
console.log(JSON.stringify(jsonSchema2, null, 2));

// Test validation with reconstructed schema
const testUser = {
	id: '123',
	name: 'John Doe',
	email: 'john@example.com',
	age: 30,
	role: 'admin',
	isActive: true,
	metadata: {
		lastLogin: '2025-01-01',
		preferences: {
			theme: 'dark',
			notifications: true,
		},
	},
	tags: ['developer'],
};

console.log('\n=== Validation Test ===\n');
const result = reconstructedSchema['~standard'].validate(testUser);
console.log('Validation result:', result.issues ? 'FAILED' : 'SUCCESS');
if (result.issues) {
	console.log('Issues:', result.issues);
}

console.log('\n=== Test 2: Direct JSON Schema ===\n');

// Create a JSON Schema directly
const personJSONSchema = {
	type: 'object' as const,
	description: 'Person information',
	properties: {
		firstName: {
			type: 'string' as const,
			description: 'First name',
		},
		lastName: {
			type: 'string' as const,
			description: 'Last name',
		},
		age: {
			type: 'number' as const,
			description: 'Age',
		},
		address: {
			type: 'object' as const,
			description: 'Mailing address',
			properties: {
				street: { type: 'string' as const },
				city: { type: 'string' as const },
				zipCode: { type: 'string' as const },
			},
			required: ['street', 'city', 'zipCode'],
		},
		hobbies: {
			type: 'array' as const,
			description: 'List of hobbies',
			items: {
				type: 'string' as const,
			},
		},
		status: {
			enum: ['active', 'inactive', 'pending'],
			description: 'Account status',
		},
	},
	required: ['firstName', 'lastName', 'age', 'address', 'hobbies', 'status'],
};

console.log('Input JSON Schema:');
console.log(JSON.stringify(personJSONSchema, null, 2));

// Convert to our schema
const personSchema = s.fromJSONSchema(personJSONSchema);

// Test validation
const testPerson = {
	firstName: 'Jane',
	lastName: 'Smith',
	age: 25,
	address: {
		street: '123 Main St',
		city: 'Springfield',
		zipCode: '12345',
	},
	hobbies: ['reading', 'coding'],
	status: 'active',
};

console.log('\nValidation test:');
const personResult = personSchema['~standard'].validate(testPerson);
console.log('Result:', personResult.issues ? 'FAILED' : 'SUCCESS');
if (!personResult.issues) {
	console.log('Valid person:', personResult.value);
}

console.log('\n=== Test 3: Nullable pattern ===\n');

const nullableStringSchema = {
	anyOf: [{ type: 'string' as const }, { type: 'null' as const }],
	description: 'A nullable string',
};

const schema = s.fromJSONSchema(nullableStringSchema);
console.log('Schema created from nullable pattern');

// Test with string
const result1 = schema['~standard'].validate('hello');
console.log('Validate "hello":', result1.issues ? 'FAILED' : 'SUCCESS');

// Test with null
const result2 = schema['~standard'].validate(null);
console.log('Validate null:', result2.issues ? 'FAILED' : 'SUCCESS');

// Test with number (should fail)
const result3 = schema['~standard'].validate(123);
console.log('Validate 123:', result3.issues ? 'FAILED (expected)' : 'SUCCESS');

console.log('\n=== Test 4: Literal values ===\n');

const literalSchema = {
	const: 'admin' as const,
	type: 'string' as const,
	description: 'Admin role',
};

const adminSchema = s.fromJSONSchema(literalSchema);
console.log('Literal schema created');

const adminResult1 = adminSchema['~standard'].validate('admin');
console.log('Validate "admin":', adminResult1.issues ? 'FAILED' : 'SUCCESS');

const adminResult2 = adminSchema['~standard'].validate('user');
console.log('Validate "user":', adminResult2.issues ? 'FAILED (expected)' : 'SUCCESS');
