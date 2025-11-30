#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const result = spawnSync('bunx', ['@agentuity/cli@latest', 'create', ...args], {
	stdio: 'inherit',
});
process.exit(result.status || 0);
