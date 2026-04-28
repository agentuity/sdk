#!/usr/bin/env bun
/**
 * Manual smoke test for the inline ghost-text placeholder in PromptFlow.text().
 *
 * Run: bun packages/cli/scripts/test-ghost-prompt.ts
 *
 * What to look for:
 *   - On the first prompt, you should see `my-bot-storage-abc` painted dim
 *     after the cursor. The cursor should sit at the start of that text.
 *   - Pressing Enter immediately should accept the placeholder.
 *   - Pressing any letter should make the ghost vanish and your typed input
 *     should appear in normal color.
 *   - Backspacing back to empty should NOT bring the ghost back.
 *   - The second prompt has no placeholder — should behave exactly like the
 *     existing readline-based prompt (regression check).
 */
import { createPrompt } from '../src/tui/prompt';

async function main() {
	const prompt = createPrompt();
	prompt.intro('Ghost prompt test');

	const v1 = await prompt.text({
		message: 'Bucket name',
		hint: 'Optional · lowercase letters, digits, hyphens',
		placeholder: 'my-bot-storage-abc',
		validate: (val) => {
			if (val === '') return true;
			if (val.length < 3) return 'Too short (min 3)';
			if (!/^[a-z0-9-]+$/.test(val)) return 'Only lowercase, digits, hyphens';
			return true;
		},
	});
	console.log('Resolved 1:', JSON.stringify(v1));

	const v2 = await prompt.text({
		message: 'Description (no placeholder, regression check)',
		hint: 'Optional · press Enter to skip',
	});
	console.log('Resolved 2:', JSON.stringify(v2));

	prompt.outro('done');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
