import { resolve } from "node:path";
import { z } from "zod";
import { isTTY } from "../../auth";
import { getCommand } from "../../command-prefix";
import { ErrorCode } from "../../errors";
import * as tui from "../../tui";
import { createSubcommand } from "../../types";
import { runProjectImport } from "./reconcile";
import { runRemoteImport } from "./remote-import";

const ProjectImportResponseSchema = z.object({
	success: z.boolean().describe("Whether the import succeeded"),
	projectId: z.string().optional().describe("Project ID if imported"),
	orgId: z.string().optional().describe("Organization ID"),
	region: z.string().optional().describe("Region"),
	status: z
		.enum(["valid", "imported", "skipped", "error"])
		.describe("The result status of the import"),
	message: z.string().optional().describe("Status message"),
});

export const importSubcommand = createSubcommand({
	name: "import",
	description:
		"Import or register a local or remote project with Agentuity Cloud",
	tags: ["mutating", "creates-resource", "requires-auth"],
	examples: [
		{
			command: getCommand("project import"),
			description: "Import project in current directory",
		},
		{
			command: getCommand("project import --dir ./my-agent"),
			description: "Import project from specified directory",
		},
		{
			command: getCommand("project import https://github.com/owner/repo"),
			description: "Import a remote project from GitHub",
		},
		{
			command: getCommand(
				"project import https://github.com/owner/repo --deploy --name my-agent",
			),
			description: "Import remote project, name it, and deploy",
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { region: true, org: true },
	schema: {
		args: z.array(z.string().describe("GitHub URL to import from")).max(1),
		options: z.object({
			dir: z
				.string()
				.optional()
				.describe(
					"Directory containing the project (default: current directory)",
				),
			validateOnly: z
				.boolean()
				.optional()
				.describe("Only validate the project structure without prompting"),
			deploy: z
				.boolean()
				.optional()
				.default(false)
				.describe("Deploy the project after importing"),
			projectId: z
				.string()
				.optional()
				.describe("Use a pre-created project ID (skip creation)"),
			repo: z
				.string()
				.optional()
				.describe("Target GitHub repo URL to push imported code to"),
			name: z
				.string()
				.optional()
				.describe("Project name (for non-interactive mode)"),
		}),
		response: ProjectImportResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, auth, apiClient, config, logger, orgId } = ctx;

		if (!config) {
			tui.fatal(
				"Configuration not loaded. Please try again.",
				ErrorCode.CONFIG_INVALID,
			);
		}

		// If a URL positional arg is provided, run remote import flow
		const url = args[0];
		if (url) {
			await runRemoteImport({
				url,
				deploy: opts.deploy ?? false,
				projectId: opts.projectId,
				repo: opts.repo,
				name: opts.name,
				org: orgId,
				apiClient,
				auth,
				config,
				logger,
			});

			return {
				success: true,
				status: "imported" as const,
				message: "Remote project imported successfully",
			};
		}

		// No URL — fall through to existing local import behavior
		const dir = opts.dir ? resolve(opts.dir) : process.cwd();
		const validateOnly = opts.validateOnly ?? false;

		const result = await runProjectImport({
			dir,
			auth,
			apiClient,
			config,
			logger,
			interactive: validateOnly ? false : isTTY(),
			validateOnly,
		});

		if (result.status === "error") {
			tui.fatal(
				result.message ?? "Failed to import project",
				ErrorCode.PROJECT_NOT_FOUND,
			);
		}

		if (result.status === "skipped") {
			tui.info(result.message || "Import cancelled.");
			return {
				success: false,
				status: result.status,
				message: result.message,
			};
		}

		// Show success message for validateOnly mode
		if (validateOnly && result.status === "valid" && !result.project) {
			tui.success(result.message || "Project structure is valid.");
		}

		return {
			success: result.status === "valid" || result.status === "imported",
			projectId: result.project?.projectId,
			orgId: result.project?.orgId,
			region: result.project?.region,
			status: result.status,
			message:
				result.status === "imported"
					? "Project imported successfully"
					: result.message || "Project is already registered",
		};
	},
});
