# Terminal UI Utilities

The `tui` module provides semantic helpers for formatted, colorized console output.

## Usage

```typescript
import * as tui from '@agentuity/cli/tui';

// Or from within the package:
import * as tui from './tui';
```

## Message Functions

Print semantic messages with automatic icons and colors:

### `tui.success(message: string)`

Print a success message with a green checkmark (✓).

```typescript
tui.success('Welcome to Agentuity! You are now logged in');
// Output: ✓ Welcome to Agentuity! You are now logged in (in green)
```

### `tui.error(message: string)`

Print an error message with a red X (✗).

```typescript
tui.error('Connection failed');
// Output: ✗ Connection failed (in red)
```

### `tui.warning(message: string)`

Print a warning message with a yellow warning icon (⚠).

```typescript
tui.warning('CLI Upgrade Required');
// Output: ⚠ CLI Upgrade Required (in yellow)
```

### `tui.info(message: string)`

Print an info message with a cyan info icon (ℹ).

```typescript
tui.info('Processing request...');
// Output: ℹ Processing request... (in cyan)
```

## List Functions

### `tui.bullet(message: string)`

Print a bulleted list item (•).

```typescript
tui.bullet('First item');
tui.bullet('Second item');
```

### `tui.arrow(message: string)`

Print an arrow item (→), useful for showing next steps.

```typescript
tui.arrow('Run: agentuity deploy');
tui.arrow('Visit: https://app.agentuity.com');
```

## Text Formatting

These functions return formatted strings (don't print directly):

### `tui.bold(text: string): string`

Format text in bold.

```typescript
console.log(`Name: ${tui.bold('Production')}`);
```

### `tui.muted(text: string): string`

Format text in muted/gray color.

```typescript
console.log(`${tui.muted('(optional)')}`);
```

### `tui.link(url: string): string`

Format text as a clickable link (blue and underlined). If the terminal supports OSC 8 hyperlinks, creates a clickable link.

```typescript
console.log(`Visit: ${tui.link('https://agentuity.com')}`);
```

Supported terminals for clickable links:

- iTerm2
- WezTerm
- Ghostty
- Apple Terminal
- Hyper
- Kitty
- Windows Terminal

## Utility Functions

### `tui.newline()`

Print a blank line (shorthand for `console.log('')`).

```typescript
tui.success('Done!');
tui.newline();
console.log('Next steps:');
```

### `tui.waitForAnyKey(message?: string): Promise<void>`

Wait for the user to press Enter before continuing. Useful for pausing execution to let the user read output or confirm an action.

```typescript
await tui.waitForAnyKey(); // Uses default message: "Press Enter to continue..."
await tui.waitForAnyKey('Press Enter to open the browser...');
```

**Behavior:**

- Waits for any key press (Enter, Space, etc.)
- Automatically exits with code 1 if CTRL+C is pressed
- Uses raw mode to capture single keypress

**Use cases:**

- Pausing before opening a browser
- Letting user read important information
- Confirming before proceeding with an action

### `tui.copyToClipboard(text: string): Promise<boolean>`

Copy text to the system clipboard. Returns `true` if successful, `false` otherwise.

```typescript
const copied = await tui.copyToClipboard('ABC123');
if (copied) {
	tui.success('Code copied to clipboard!');
} else {
	console.log('Copy the following code: ABC123');
}
```

**Platform support:**

- macOS: Uses `pbcopy`
- Windows: Uses `clip`
- Linux: Tries `xclip`, falls back to `xsel`

**Note:** Silently fails if clipboard utilities are not available (returns `false`).

### `tui.padRight(str: string, length: number, pad?: string): string`

Pad a string to a specific length on the right.

```typescript
const name = tui.padRight('prod', 10, ' ');
console.log(`${name} ${tui.muted('(active)')}`);
```

### `tui.padLeft(str: string, length: number, pad?: string): string`

Pad a string to a specific length on the left.

```typescript
const count = tui.padLeft('5', 3, '0');
console.log(count); // "005"
```

## Color Scheme

The TUI module automatically adapts colors for light and dark terminals. You can set the color scheme:

```typescript
import { setColorScheme } from './tui';

setColorScheme('dark'); // or 'light'
```

**Note:** The CLI automatically detects and sets the color scheme based on terminal settings.

## Banner

### `tui.banner(title: string, body: string)`

Display a formatted banner with a bordered box around the content. Perfect for important messages, welcome screens, or upgrade notices.

```typescript
tui.banner('Welcome', 'Thank you for using Agentuity! Your setup is complete.');
```

Output:

```
╭──────────────────────────────────────────────────╮
│                                                  │
│                    Welcome                       │
│                                                  │
│ Thank you for using Agentuity! Your setup is     │
│ complete.                                        │
│                                                  │
╰──────────────────────────────────────────────────╯
```

**Features:**

- Automatically wraps text to fit within 80 characters
- Centers the title
- Pads body text with borders
- Supports embedded formatting (bold, muted, links)
- Handles unicode characters correctly (emoji, CJK characters) using `Bun.stringWidth()`

## Complete Example

```typescript
import * as tui from './tui';

tui.info('Deploying application...');
tui.newline();

tui.bullet('Building assets');
tui.bullet('Uploading to server');
tui.bullet('Running migrations');

tui.newline();
tui.success('Deployment complete!');
tui.newline();

console.log('Next steps:');
tui.arrow(`Visit ${tui.link('https://app.agentuity.com')}`);
tui.arrow(`View logs: ${tui.bold('agentuity logs')}`);
```

## Design Philosophy

- **Semantic over presentational**: Use `tui.success()` instead of manually coloring text green
- **Consistent icons**: Each message type has a standard icon
- **Adaptive colors**: Colors adjust for light/dark terminals
- **No logger prefix**: TUI functions use raw console output, no `[INFO]` prefixes
- **Composable**: Text formatting functions return strings for flexible composition
