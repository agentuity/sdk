# Team Agent - Subagent Example

This agent demonstrates the subagent feature in Agentuity.

## Structure

```text
team/                    # Parent agent
├── agent.ts            # Parent agent logic
├── route.ts            # Parent agent routes
├── members/            # Subagent 1
│   ├── agent.ts
│   └── route.ts
└── tasks/              # Subagent 2
    ├── agent.ts
    └── route.ts
```

## Routes

### Parent Agent

- `GET /agent/team` - Get team info
- `POST /agent/team` - Execute team action

### Members Subagent

- `GET /agent/team/members` - List all members
- `POST /agent/team/members` - Execute member action
- `POST /agent/team/members/add` - Add a member
- `POST /agent/team/members/remove` - Remove a member

### Tasks Subagent

- `GET /agent/team/tasks` - List all tasks
- `POST /agent/team/tasks` - Execute task action
- `POST /agent/team/tasks/add` - Add a task
- `POST /agent/team/tasks/complete` - Complete a task

## Agent Context Usage

### Accessing Subagents from Routes

```typescript
// In route.ts
router.get('/', async (c) => {
	// Access parent agent
	const teamInfo = await c.agent.team.run({ action: 'info' });

	// Access subagents (nested access)
	const members = await c.agent.team.members.run({ action: 'list' });
	const tasks = await c.agent.team.tasks.run({ action: 'list' });

	return c.json({ teamInfo, members, tasks });
});
```

### Parent Reference in Subagents

```typescript
// In subagent agent.ts
handler: async (ctx, input) => {
	// Access parent agent
	if (ctx.parent) {
		const parentResult = await ctx.parent.run({ action: 'info' });
		console.log('Parent says:', parentResult.message);
	}

	// Current agent name includes parent: "team.members"
	console.log('Current agent:', ctx.agentName);

	return result;
};
```

## Key Features Demonstrated

1. **Nested Structure**: Agents can have subagents one level deep
2. **Parent Context**: Subagents can access their parent via `ctx.parent`
3. **Agent Names**: Subagents have dotted names like `"team.members"`
4. **Route Inheritance**: Subagents inherit parent middleware
5. **Typed Access**: Full TypeScript support for nested agent calls
6. **Dual Registration**: Agents registered both as `"parent.child"` and nested on parent

## Testing

Run the subagent tests:

```bash
cd apps/testing/auth-app
bash scripts/test-subagents.sh
```

Or run all tests including subagents:

```bash
bash scripts/test.sh
```
