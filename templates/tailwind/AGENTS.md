# Agent Guidelines for {{PROJECT_NAME}}

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Deploy**: `bun run deploy` (deploys your app to the Agentuity cloud)

## Agent-Friendly CLI

The Agentuity CLI is designed to be agent-friendly with programmatic interfaces, structured output, and comprehensive introspection.

Read the [AGENTS.md](./node_modules/@agentuity/cli/AGENTS.md) file in the Agentuity CLI for more information on how to work with this project.

## Instructions

- This project uses Bun instead of NodeJS and TypeScript for all source code
- This is an Agentuity Agent project
- **This template uses Tailwind CSS v4** for styling

## Web Frontend (src/web/)

The `src/web/` folder contains your React frontend with Tailwind CSS, automatically bundled by the Agentuity build system.

**File Structure:**

- `index.html` - Main HTML file with `<link rel="stylesheet" href="tailwindcss" />` and `<script type="module" src="./frontend.tsx">`
- `frontend.tsx` - Entry point that renders the React app to `#root`
- `App.tsx` - Your main React component with Tailwind utility classes
- `public/` - Static assets (optional)

**How It Works:**

1. The build system automatically bundles `frontend.tsx` and all its imports (including `App.tsx`)
2. The Tailwind plugin scans your TSX files for utility classes and generates optimized CSS
3. The bundled JavaScript is placed in `.agentuity/web/chunk/`
4. The generated CSS is placed in `.agentuity/web/chunk/`
5. The HTML file is served at the root `/` route
6. Script and stylesheet references are automatically resolved to the bundled chunks

**Key Points:**

- Use proper TypeScript/TSX syntax - the bundler handles all compilation
- **Use Tailwind utility classes** (e.g., `className="bg-blue-500 text-white p-4"`) instead of inline styles or `<style>` tags
- No need for Babel or external bundlers
- React is bundled into the output (no CDN needed)
- Tailwind CSS is automatically processed and tree-shaken (only used utilities are included)
- Supports hot module reloading in dev mode with `import.meta.hot`
- Components can use all modern React features and TypeScript

**Styling with Tailwind CSS:**

```tsx
// ✅ RECOMMENDED: Use Tailwind utility classes
export function App() {
	const [count, setCount] = useState(0);
	return (
		<button
			className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
			onClick={() => setCount((c) => c + 1)}
		>
			{count}
		</button>
	);
}

// ❌ AVOID: Inline styles or <style> tags
export function App() {
	return <button style={{ backgroundColor: 'blue' }}>Click</button>;
}
```

**Common Tailwind Patterns:**

```tsx
// Layout
<div className="flex items-center justify-center gap-4">

// Responsive design
<div className="w-full md:w-1/2 lg:w-1/3">

// Dark mode
<div className="bg-white dark:bg-zinc-900">

// Hover states
<button className="bg-blue-500 hover:bg-blue-600">

// Custom spacing
<div className="p-4 m-8 space-y-2">
```

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)
