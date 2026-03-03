import { s } from '../src/index.js';

// Basic types
const userSchema = s.object({
	name: s.string(),
	age: s.number(),
	email: s.string(),
	isActive: s.boolean(),
});

// Test valid data
const validUser = {
	name: 'John Doe',
	age: 30,
	email: 'john@example.com',
	isActive: true,
};

const result1 = userSchema['~standard'].validate(validUser);
console.log('Valid user:', result1);

// Test invalid data
const invalidUser = {
	name: 'Jane',
	age: 'not a number',
	email: 'jane@example.com',
	isActive: true,
};

const result2 = userSchema['~standard'].validate(invalidUser);
console.log('Invalid user:', result2);

// Optional and nullable
const optionalSchema = s.object({
	name: s.string(),
	nickname: s.optional(s.string()),
	age: s.nullable(s.number()),
});

const result3 = optionalSchema['~standard'].validate({
	name: 'Test',
	age: null,
});
console.log('Optional/nullable:', result3);

// Arrays
const stringArraySchema = s.array(s.string());
const result4 = stringArraySchema['~standard'].validate(['a', 'b', 'c']);
console.log('Array:', result4);

// Union
const statusSchema = s.union(s.literal('active'), s.literal('inactive'), s.literal('pending'));

const result5 = statusSchema['~standard'].validate('active');
console.log('Union:', result5);

const result6 = statusSchema['~standard'].validate('invalid');
console.log('Invalid union:', result6);
