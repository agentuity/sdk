import { createSubcommand } from '@/types';
import { z } from 'zod';
import enquirer from 'enquirer';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';

export const createProjectSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a new project',
	aliases: ['new'],
	toplevel: true,
	requiresAuth: false,
	schema: {
		options: z.object({
			name: z.string().optional().describe('Project name'),
			dir: z.string().optional().describe('Directory to create the project in'),
			install: z
				.boolean()
				.optional()
				.default(true)
				.describe('Run bun install after creating the project (use --no-install to skip)'),
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
			fromBunCreate: z
				.boolean()
				.optional()
				.describe('Internal: called from bun create postinstall'),
			dev: z.boolean().optional().describe('Internal: use local template for testing'),
		}),
	},

	async handler(ctx) {
		const { logger, opts } = ctx;

		// Case 2: Called from bun create postinstall
		if (opts.fromBunCreate) {
			const projectDir = process.cwd();
			const packageJsonPath = join(projectDir, 'package.json');

			if (!existsSync(packageJsonPath)) {
				logger.error('package.json not found in current directory');
				return;
			}

			// Disable log prefixes for cleaner postinstall output
			logger.setShowPrefix(false);

			const packageJsonFile = Bun.file(packageJsonPath);
			const packageJson = await packageJsonFile.json();
			const projectName = packageJson.name || basename(projectDir);

			logger.info(`\n🔧 Setting up ${projectName}...\n`);

			// Update package.json - remove bun-create metadata
			packageJson.name = projectName;
			delete packageJson['bun-create'];
			delete packageJson.bin;
			packageJson.private = true;
			delete packageJson.files;
			delete packageJson.keywords;
			delete packageJson.author;
			delete packageJson.license;
			delete packageJson.publishConfig;
			delete packageJson.description;

			// Remove enquirer from dependencies (only needed for setup)
			if (packageJson.dependencies) {
				delete packageJson.dependencies.enquirer;
			}

			await Bun.write(packageJsonPath, JSON.stringify(packageJson, null, '\t'));
			logger.info('✓ Updated package.json');

			// Update README.md
			const readmePath = join(projectDir, 'README.md');
			if (existsSync(readmePath)) {
				const readmeFile = Bun.file(readmePath);
				let readme = await readmeFile.text();
				readme = readme.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
				await Bun.write(readmePath, readme);
				logger.info('✓ Updated README.md');
			}

			// Update AGENTS.md
			const agentsMdPath = join(projectDir, 'AGENTS.md');
			if (existsSync(agentsMdPath)) {
				const agentsMdFile = Bun.file(agentsMdPath);
				let agentsMd = await agentsMdFile.text();
				agentsMd = agentsMd.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
				await Bun.write(agentsMdPath, agentsMd);
				logger.info('✓ Updated AGENTS.md');
			}

			// Remove setup files
			const filesToRemove = ['setup.ts'];
			for (const file of filesToRemove) {
				const filePath = join(projectDir, file);
				if (existsSync(filePath)) {
					await Bun.$`rm ${filePath}`;
					logger.info('✓ Removed ${file}');
				}
			}

			logger.info('\n✨ Setup complete!\n');
			return;
		}

		// Case 1: Normal CLI flow
		// Relaxed validation: any reasonable name between 2-64 characters
		const isValidProjectName = (name: string): boolean => {
			return name.trim().length >= 2 && name.trim().length <= 64;
		};

		// Transform name to URL and disk-friendly format
		const transformToDirectoryName = (name: string): string => {
			const result = name
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
				.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
				.replace(/-+/g, '-') // Replace consecutive hyphens with single hyphen
				.substring(0, 64); // Ensure max length

			// Validate result is non-empty (happens when name contains only special chars)
			if (!result) {
				throw new Error(
					`Invalid project name "${name}": must contain at least one alphanumeric character`
				);
			}

			return result;
		};

		// Get project name
		let projectName = opts.name;
		while (!projectName || !isValidProjectName(projectName)) {
			const result = await enquirer.prompt<{ name: string }>({
				type: 'input',
				name: 'name',
				message: 'Project name:',
				initial: projectName,
				validate: (value: string) => {
					if (!value) return 'Project name is required';
					if (!isValidProjectName(value)) {
						return 'Project name must be between 2 and 64 characters';
					}
					return true;
				},
			});
			projectName = result.name;
		}

		projectName = projectName.trim();
		const projectDirName = transformToDirectoryName(projectName);

		// Get directory - if specified, create the project there, otherwise create in current dir
		const baseDir = opts.dir ? resolve(opts.dir) : process.cwd();
		const targetDir = resolve(baseDir, projectDirName);

		// Check if directory exists and validate
		let shouldProceed = true;
		if (existsSync(targetDir)) {
			const files = readdirSync(targetDir);
			const hasFiles = files.length > 0;

			if (hasFiles) {
				if (opts.confirm === false) {
					logger.error(`Directory ${targetDir} is not empty and --no-confirm was specified`);
					return;
				}

				// Require explicit confirmation in non-TTY environments
				if (opts.confirm !== true && !process.stdin.isTTY) {
					logger.error(
						`Directory "${targetDir}" is not empty. Use --confirm flag in non-interactive environments.`
					);
					return;
				}

				// Interactive prompt in TTY environments
				if (opts.confirm !== true && process.stdin.isTTY) {
					const result = await enquirer.prompt<{ proceed: boolean }>({
						type: 'confirm',
						name: 'proceed',
						message: `Directory "${targetDir}" is not empty. Files may be overwritten. Continue?`,
						initial: false,
					});
					shouldProceed = result.proceed;
				}

				if (!shouldProceed) {
					logger.info('Operation cancelled');
					return;
				}
			}
		}

		// Print collected values
		logger.info('\n=== Project Configuration ===');
		logger.info(`Name: ${projectName}`);
		logger.info(`Directory Name: ${projectDirName}`);
		logger.info(`Target Directory: ${targetDir}`);
		logger.info('=============================\n');

		// Run bun create to scaffold the project
		logger.info('Creating project from template...');

		try {
			// Determine template name based on dev mode
			const templateName = opts.dev ? 'agentuity-dev' : 'agentuity';

			if (opts.dev) {
				logger.info('🔧 Dev mode: Using local template');
			}

			// Build bun create command args
			// Note: bun create supports --no-install to skip dependency installation
			const bunCreateArgs = ['bun', 'create'];
			if (opts.install === false) {
				bunCreateArgs.push('--no-install');
			}
			bunCreateArgs.push(templateName, projectDirName);

			logger.info(`Running: ${bunCreateArgs.join(' ')}`);

			const result = Bun.spawn(bunCreateArgs, {
				cwd: baseDir,
				stdout: 'inherit',
				stderr: 'inherit',
				stdin: 'inherit',
			});

			const exitCode = await result.exited;

			if (exitCode !== 0) {
				throw new Error(`bun create exited with code ${exitCode}`);
			}

			logger.info('\n✨ Project created successfully!');
			logger.info(`\nNext steps:`);
			logger.info(`  cd ${projectDirName}`);
			logger.info(`  bun run dev`);
		} catch (error) {
			logger.error('Failed to create project:', error);
			throw error;
		}
	},
});
