import * as vscode from 'vscode';
import { getCliClient } from '../../core/cliClient';

const DESTRUCTIVE_PATTERNS = [
	/^auth\s+logout/i,
	/\bdelete\b/i,
	/\bremove\b/i,
	/\bdestroy\b/i,
	/\bdrop\b/i,
];

const CONFIRMATION_PATTERNS = [/^cloud\s+deploy/i];

export interface CliToolInput {
	command: string;
	jsonOutput?: boolean;
}

export class AgentuityCliTool implements vscode.LanguageModelTool<CliToolInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<CliToolInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		const { command, jsonOutput = true } = options.input;

		if (!command || command.trim() === '') {
			throw new Error('Command is required. Provide an agentuity CLI subcommand.');
		}

		for (const pattern of DESTRUCTIVE_PATTERNS) {
			if (pattern.test(command)) {
				throw new Error(
					`Destructive command detected: "${command}". This command is not allowed via the AI assistant. Please run it manually in the terminal.`
				);
			}
		}

		const args = command.split(/\s+/).filter((arg) => arg.length > 0);

		const cli = getCliClient();
		const result = await cli.exec(args, { format: jsonOutput ? 'json' : 'text' });

		if (!result.success) {
			throw new Error(`CLI command failed: ${result.error}`);
		}

		const output =
			typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);

		return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(output)]);
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<CliToolInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation | undefined> {
		const { command } = options.input;

		for (const pattern of CONFIRMATION_PATTERNS) {
			if (pattern.test(command)) {
				return {
					invocationMessage: `Run deployment command: \`agentuity ${command}\``,
					confirmationMessages: {
						title: 'Deploy to Agentuity Cloud',
						message: new vscode.MarkdownString(
							`This will deploy your project to Agentuity Cloud.\n\n\`\`\`bash\nagentuity ${command}\n\`\`\`\n\nDo you want to continue?`
						),
					},
				};
			}
		}

		return {
			invocationMessage: `Running: \`agentuity ${command}\``,
		};
	}
}

export function registerCliTool(context: vscode.ExtensionContext): void {
	if (!vscode.lm?.registerTool) {
		return;
	}

	try {
		const tool = new AgentuityCliTool();
		const disposable = vscode.lm.registerTool('agentuity_run_cli', tool);
		context.subscriptions.push(disposable);
	} catch {
		// LM API not available
	}
}
