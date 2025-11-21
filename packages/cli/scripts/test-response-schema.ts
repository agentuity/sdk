#!/usr/bin/env bun
/**
 * Test response schema functionality
 */

import { z } from 'zod';
import { createSubcommand } from '../src/types';
import { getCommand } from '../src/command-prefix';

// Define a response schema for testing
const UserResponseSchema = z.object({
	id: z.string().describe('User ID'),
	name: z.string().describe('Full name'),
	email: z.string().email().describe('Email address'),
	organizations: z
		.array(
			z.object({
				id: z.string().describe('Organization ID'),
				name: z.string().describe('Organization name'),
				role: z.enum(['owner', 'admin', 'member']).describe('User role'),
			})
		)
		.describe('Organizations the user belongs to'),
	createdAt: z.string().datetime().describe('Account creation timestamp'),
});

const ProjectListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Project ID'),
		name: z.string().describe('Project name'),
		orgId: z.string().describe('Organization ID'),
		createdAt: z.string().datetime().describe('Creation timestamp'),
	})
);

// Create a test command with response schema
const testCommand = createSubcommand({
	name: 'whoami',
	description: 'Show current user information',
	requires: { auth: true },
	schema: {
		response: UserResponseSchema,
	},
	examples: [getCommand('auth whoami'), getCommand('auth whoami --json')],
	async handler(_ctx) {
		// Mock implementation
		console.log('Mock user data');
	},
});

const projectListCommand = createSubcommand({
	name: 'list',
	description: 'List all projects',
	requires: { auth: true },
	schema: {
		response: ProjectListResponseSchema,
	},
	examples: [getCommand('project list'), getCommand('project list --json')],
	async handler(_ctx) {
		// Mock implementation
		console.log('Mock project list');
	},
});

console.log('Test Response Schema Definitions\n');
console.log('=================================\n');

// Test 1: Verify schema is present
console.log('Test 1: Response schema is defined');
console.log('-----------------------------------');
console.log(`whoami command has response schema: ${!!testCommand.schema?.response}`);
console.log(`list command has response schema: ${!!projectListCommand.schema?.response}`);
console.log();

// Test 2: Convert to JSON Schema
console.log('Test 2: Convert to JSON Schema');
console.log('-------------------------------');
const userJsonSchema = z.toJSONSchema(UserResponseSchema);
console.log('User Response Schema:');
console.log(JSON.stringify(userJsonSchema, null, 2));
console.log();

const projectListJsonSchema = z.toJSONSchema(ProjectListResponseSchema);
console.log('Project List Response Schema:');
console.log(JSON.stringify(projectListJsonSchema, null, 2));
console.log();

console.log('All tests completed! ✓');
