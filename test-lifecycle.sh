#!/bin/bash
set -e

echo "Testing lifecycle generation..."

# Create temp project
TMP=$(mktemp -d)
cd "$TMP"

# Create simple project
mkdir -p src/agent/hello
cat > app.ts << 'EOF'
import { createApp } from '@agentuity/runtime';

const app = await createApp({
	setup: () => {
		return { foo: 'bar', count: 42 };
	},
});

export default app;
EOF

cat > src/agent/hello/agent.ts << 'EOF'
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('hello', {
	schema: {
		input: s.object({ name: s.string() }),
		output: s.string(),
	},
	handler: async (_c, { name }) => `Hello, ${name}!`,
});
EOF

cat > src/agent/hello/index.ts << 'EOF'
export { default } from './agent';
EOF

# Copy tsconfig and package.json from template
cp -r /Users/jhaynie/code/agentuity/worktree/refactor-generated-code/sdk/templates/_base/tsconfig.json .
cp -r /Users/jhaynie/code/agentuity/worktree/refactor-generated-code/sdk/templates/_base/package.json .

echo "Installing..."
bun install > /dev/null 2>&1

echo "Building..."
bun /Users/jhaynie/code/agentuity/worktree/refactor-generated-code/sdk/packages/cli/bin/cli.ts build

echo ""
echo "Generated files in src/generated:"
ls -la src/generated/

echo ""
echo "=== state.ts ==="
cat src/generated/state.ts 2>/dev/null || echo "NOT FOUND"

echo ""
echo "=== router.ts ==="
head -5 src/generated/router.ts 2>/dev/null || echo "NOT FOUND"

# Cleanup
cd /
rm -rf "$TMP"
