import { z } from 'zod';
import { createCommand } from '../../../../types';
import { getCommand } from '../../../../command-prefix';

const TEMPLATE_YAML = `# yaml-language-server: $schema=https://agentuity.dev/schema/cli/v1/agentuity-snapshot.json
#
# Agentuity Snapshot Build File
# =============================
# This file defines a reproducible sandbox environment.
# Build with: agentuity cloud sandbox snapshot build <directory>
#
# For documentation, see: https://agentuity.dev/Services/Sandbox

# Required: Schema version (must be 1)
version: 1

# Required: Runtime environment
# Format: name:tag (e.g., bun:1, node:20, python:3.12)
# Run 'agentuity cloud sandbox runtime list' to see available runtimes
runtime: bun:1

# Optional: Snapshot name (alphanumeric, underscores, dashes only)
# If not provided, a unique name will be auto-generated
# name: my-snapshot

# Optional: Human-readable description
# Can be overridden with --description flag
description: My sandbox snapshot

# Optional: Apt packages to install
# Packages are validated against Debian stable repositories
# Supports version pinning: package=version or package=version* (prefix match)
# dependencies:
#   - curl
#   - ffmpeg
#   - imagemagick=8:6.9*

# Optional: Files to include from the build context directory
# Supports glob patterns and negative patterns (prefix with !)
# Files are placed in /home/agentuity/ in the sandbox
# files:
#   - "*.js"              # All JS files in root
#   - src/**              # All files in src/ recursively
#   - config/*.json       # All JSON files in config/
#   - "!**/*.test.js"     # Exclude test files
#   - "!node_modules/**"  # Exclude node_modules

# Optional: Environment variables
# Use \${VAR} syntax for build-time substitution via --env flag
# env:
#   NODE_ENV: production
#   API_URL: https://api.example.com
#   SECRET_KEY: \${SECRET_KEY}  # Substituted from: --env SECRET_KEY=value

# Optional: Custom metadata
# Use \${VAR} syntax for build-time substitution via --metadata flag
# Stored with the snapshot for reference
# metadata:
#   version: \${VERSION}   # Substituted from: --metadata VERSION=1.0.0
#   author: team-name
#   build_date: \${BUILD_DATE}
`;

const TEMPLATE_JSON = {
	$schema: 'https://agentuity.dev/schema/cli/v1/agentuity-snapshot.json',
	version: 1,
	runtime: 'bun:1',
	name: 'my-snapshot',
	description: 'My sandbox snapshot',
	dependencies: ['curl'],
	files: ['src/**', '*.js', '!**/*.test.js'],
	env: {
		NODE_ENV: 'production',
	},
	metadata: {
		version: '1.0.0',
	},
};

const GenerateResponseSchema = z.object({
	format: z.enum(['yaml', 'json']).describe('Output format'),
	content: z.string().describe('Generated template content'),
});

export const generateSubcommand = createCommand({
	name: 'generate',
	aliases: ['gen', 'init'],
	description: 'Generate a template snapshot build file',
	tags: [],
	requires: {},
	examples: [
		{
			command: getCommand('cloud sandbox snapshot generate'),
			description: 'Generate a YAML template (default)',
		},
		{
			command: getCommand('cloud sandbox snapshot generate --format json'),
			description: 'Generate a JSON template',
		},
		{
			command: getCommand('cloud sandbox snapshot generate > agentuity-snapshot.yaml'),
			description: 'Save template to a file',
		},
	],
	schema: {
		options: z.object({
			format: z.enum(['yaml', 'json']).default('yaml').describe('Output format (yaml or json)'),
		}),
		response: GenerateResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const format = opts.format;

		let content: string;
		if (format === 'json') {
			content = JSON.stringify(TEMPLATE_JSON, null, 2);
		} else {
			content = TEMPLATE_YAML;
		}

		if (!options.json) {
			console.log(content);
		}

		return {
			format,
			content,
		};
	},
});

export default generateSubcommand;
