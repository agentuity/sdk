# REPL Component Documentation

A production-ready, feature-rich REPL (Read-Eval-Print Loop) component for building interactive command-line interfaces.

## Features

### 🎯 Core Functionality

- **Command Parsing**: Handles commands, arguments, options (`--flag`, `-f`), and quoted strings
- **History Persistence**: Saves command history to `~/.config/agentuity/history/<name>.txt`
- **Multi-line Input**: Supports `\` continuation and auto-detects unclosed quotes/brackets
- **Streaming Output**: Supports async generators for real-time output

### ⌨️ Keyboard Shortcuts

**Navigation:**

- **Arrow Keys** - Move cursor, navigate history
- **Ctrl+A** / **Home** - Jump to beginning of line
- **Ctrl+E** / **End** - Jump to end of line
- **Ctrl+R** - Reverse history search

**Editing:**

- **Ctrl+K** - Delete from cursor to end of line
- **Ctrl+U** - Clear entire line
- **Ctrl+W** - Delete word backward
- **Backspace** / **Delete** - Delete characters

**Autocomplete:**

- **Tab** - Cycle through suggestions
- **Right Arrow** - Accept suggestion (when at end of line)
- Shows match counter: `[1/3]`

**Display:**

- **Ctrl+L** - Clear screen

**Control:**

- **Ctrl+C** - Exit REPL
- **Ctrl+D** - EOF/Exit (when line is empty)

### 🎨 Visual Features

**Syntax Highlighting:**

- **Green** - Valid commands
- **Red** - Invalid commands
- **Cyan** - Options/flags (`--option`, `-f`)
- **Gray** - Arguments

**Output:**

- `│` separator for command output
- Automatic paging for long output
- Pager controls: **Space**/Enter (next page), **q** (quit)

## Usage

### Basic Example

```typescript
import { createRepl, type ReplCommand } from '@agentuity/cli';

const commands: ReplCommand[] = [
	{
		name: 'hello',
		description: 'Say hello',
		handler: (ctx) => {
			ctx.write('Hello, world!');
		},
	},
	{
		name: 'echo',
		description: 'Echo back arguments',
		handler: (ctx) => {
			if (ctx.parsed.args.length === 0) {
				ctx.error('Usage: echo <message>');
				return;
			}
			ctx.write(ctx.parsed.args.join(' '));
		},
	},
];

await createRepl({
	name: 'myapp',
	prompt: '> ',
	welcome: 'Welcome to My App REPL!',
	exitMessage: 'Goodbye!',
	commands,
});
```

### Command Definition

```typescript
interface ReplCommand {
	name: string;
	description?: string;
	aliases?: string[];
	handler: CommandHandler;
	schema?: ReplCommandSchema;
}

interface ReplCommandSchema {
	args?: z.ZodTuple<any> | z.ZodArray<any>;
	options?: z.ZodObject<any>;
	argNames?: string[];
}

interface ReplContext {
	parsed: ParsedCommand;
	raw: string;
	write: (message: string) => void;
	error: (message: string) => void;
	success: (message: string) => void;
	info: (message: string) => void;
	warning: (message: string) => void;
	setProgress: (message: string) => void;
	signal: AbortSignal;
	exit: () => void;
	table: (columns: TableColumn[], data: Record<string, unknown>[]) => void;
	json: (value: unknown) => void;
}

interface TableColumn {
	name: string;
	alignment?: 'left' | 'right' | 'center';
}
```

### Table Output

Use `ctx.table()` to render formatted tables:

```typescript
{
	name: 'users',
	description: 'List users',
	handler: (ctx) => {
		ctx.table(
			[
				{ name: 'id', alignment: 'right' },
				{ name: 'name', alignment: 'left' },
				{ name: 'email', alignment: 'left' },
				{ name: 'active', alignment: 'center' },
			],
			[
				{ id: 1, name: 'Alice', email: 'alice@example.com', active: 'Yes' },
				{ id: 2, name: 'Bob', email: 'bob@example.com', active: 'No' },
			]
		);
	},
}
```

### JSON Output

Use `ctx.json()` to render colorized JSON:

```typescript
{
	name: 'getuser',
	description: 'Get user data',
	handler: async (ctx) => {
		const userId = ctx.parsed.args[0];
		const user = await fetchUser(userId);

		// Display colorized JSON output
		ctx.json(user);

		// Or display complex nested objects
		ctx.json({
			user,
			metadata: { timestamp: Date.now() },
			related: [...]
		});
	},
}
```

### Streaming Output

```typescript
{
	name: 'count',
	description: 'Count from 1 to N',
	handler: async function* (ctx) {
		const count = parseInt(ctx.parsed.args[0] || '10', 10);

		for (let i = 1; i <= count; i++) {
			yield `${i}\n`;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	},
}
```

### Parsed Command Structure

```typescript
interface ParsedCommand {
	command: string; // The command name
	args: string[]; // Positional arguments
	options: Record<string, string | boolean>; // Named options
}

// Example: "greet Alice --title Dr --loud"
// {
//   command: "greet",
//   args: ["Alice"],
//   options: { title: "Dr", loud: true }
// }
```

### Multi-line Input

Users can enter multi-line commands in three ways:

1. **Backslash continuation:**

   ```
   > echo hello \
   ... world
   ```

2. **Unclosed quotes:**

   ```
   > echo "hello
   ... world"
   ```

3. **Unclosed brackets:**
   ```
   > command {
   ... nested
   ... }
   ```

### Configuration Options

```typescript
interface ReplConfig {
	name?: string; // History file name (optional)
	prompt?: string; // Prompt string (default: "> ")
	welcome?: string; // Welcome message
	exitMessage?: string; // Exit message
	commands: ReplCommand[];
	showHelp?: boolean; // Show built-in help (default: true)
}
```

### Schema Validation

Define schemas to validate arguments and options with Zod:

```typescript
{
	name: 'greet',
	description: 'Greet a person',
	schema: {
		args: z.tuple([z.string().min(1)]),
		argNames: ['name'],
		options: z.object({
			title: z.string().optional(),
			loud: z.boolean().optional(),
		}),
	},
	handler: (ctx) => {
		const name = ctx.parsed.args[0];
		const title = ctx.parsed.options.title || '';
		const greeting = title ? `Hello, ${title} ${name}!` : `Hello, ${name}!`;

		if (ctx.parsed.options.loud) {
			ctx.success(greeting.toUpperCase());
		} else {
			ctx.success(greeting);
		}
	},
}
```

**Schema Benefits:**

- ✅ Arguments validated before handler runs
- ✅ Autocomplete shows argument placeholders: `greet <name>`
- ✅ Clear validation error messages
- ✅ Type coercion support (e.g., `z.coerce.number()`)
- ✅ No manual validation in handler code

## Use Cases

- **Database CLIs** - Interactive key-value, object store, or SQL shells
- **Admin Tools** - Server management and configuration REPLs
- **Development Tools** - Project scaffolding and code generation wizards
- **Testing Tools** - Interactive API testing and debugging
- **Configuration** - Interactive setup and configuration utilities

## Implementation Notes

- History is saved per REPL name to `~/.config/agentuity/history/<name>.txt`
- Built-in `help` command is automatically added unless `showHelp: false`
- Built-in exit commands: `exit`, `quit`, `q`
- Output paging activates when output exceeds terminal height
- All commands are case-insensitive
- Supports both synchronous and asynchronous command handlers
- Streaming via async generators is fully supported

## Examples

See `packages/cli/src/cmd/repl/index.ts` for a complete example with:

- Simple commands (`echo`, `upper`, `lower`)
- Commands with options (`greet --title Dr --loud`)
- Streaming output (`count`)
- Long output for paging (`longoutput`)
