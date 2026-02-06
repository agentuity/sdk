---
name: Reasoning Framework
description: When extracting structured conclusions from session data, performing validity checks on existing memories, or applying formal reasoning to analyze patterns across interactions. Activates when the Memory agent needs to extract conclusions, detect corrections, resolve conflicts, or validate stale memories.
version: 1.0.0
---

# Reasoning Framework

Reference for extracting structured conclusions from session data and validating existing memories. Used by the Memory agent when reasoning about session content.

## Reasoning Types

### 1. Explicit (What was directly stated)
- Facts, preferences, decisions explicitly mentioned
- Direct quotes or paraphrases
- Confidence: high (it was stated)

### 2. Deductive (Certain conclusions from premises)
- If A and B are true, then C must be true
- Include the premises that support each conclusion
- Confidence: high (logically certain)

### 3. Inductive (Patterns across interactions)
- Recurring behaviors, preferences, or approaches
- Note the number of occurrences
- Confidence: medium to high (based on pattern strength)

### 4. Abductive (Best explanations for observed behavior)
- Why might someone do X? What is the simplest explanation?
- Mark confidence level based on evidence
- Confidence: low to medium (inference)

### 5. Corrections (Mistakes and lessons learned)
- What went wrong and why
- How to avoid in the future
- HIGH PRIORITY — always extract and surface these
- Confidence: high (learned from experience)

## Conflict Resolution

When new information contradicts existing conclusions:
1. Prefer new information (it is more recent)
2. Mark old conclusions as superseded (not deleted)
3. Document the conflict and resolution

## Validity Checking

### When to Validate Memories

- Session starts and relevant memories are found
- Memories reference branches that may no longer exist
- Conflicts are detected between memories

### Validity Check Input

```json
{
  "type": "validity_check",
  "currentContext": {
    "branch": "feature/payments",
    "projectLabel": "github.com/acme/repo",
    "branchExists": true
  },
  "memoriesToCheck": [
    {
      "key": "session:sess_xxx",
      "branch": "feature/old-auth",
      "summary": "Implemented auth with JWT...",
      "createdAt": "2026-01-15T..."
    }
  ]
}
```

### Validity Assessment Criteria

| Criterion | Check | Result if Failed |
|-----------|-------|-----------------|
| Branch exists | Does the memory's branch still exist? | Mark as "stale" |
| Branch merged | Was the branch merged into current? | Mark as "merged" (still valid) |
| Age | Is the memory very old (>90 days)? | Note as "old" (use judgment) |
| Relevance | Does it relate to current work? | Mark relevance level |

### Validity Check Output

```json
{
  "validityResults": [
    {
      "memoryKey": "session:sess_xxx",
      "assessment": "stale",
      "reason": "Branch 'feature/old-auth' no longer exists and was not merged",
      "recommendation": "archive",
      "shouldSurface": false
    },
    {
      "memoryKey": "decision:use-jwt",
      "assessment": "valid",
      "reason": "Decision is repo-scoped and applies regardless of branch",
      "recommendation": "keep",
      "shouldSurface": true
    }
  ],
  "reasoning": "Checked 2 memories. 1 is stale (branch deleted), 1 is valid (repo-scoped)."
}
```

### Assessment Values

- **valid** — Memory is current and relevant
- **stale** — Memory is from deleted/abandoned branch
- **merged** — Memory is from a branch that was merged (still useful)
- **outdated** — Memory is old but branch exists (use judgment)
- **conflicting** — Memory conflicts with newer information

### Recommendation Values

- **keep** — Memory should remain active
- **archive** — Memory should be marked as archived
- **update** — Memory needs to be updated with new info
- **review** — Needs human review (uncertain)

## Output Format

Return structured JSON with conclusions for each relevant entity:

```json
{
  "entities": [
    {
      "entityId": "entity:user:user_123",
      "conclusions": {
        "explicit": [],
        "deductive": [],
        "inductive": [],
        "abductive": []
      },
      "corrections": [],
      "patterns": [],
      "conflictsResolved": []
    }
  ],
  "reasoning": "Brief explanation of your reasoning process"
}
```

## Entity Types

- `user` — Human developer
- `org` — Agentuity organization
- `project` — Agentuity project
- `repo` — Git repository
- `agent` — Agent type (lead, builder, etc.)
- `model` — LLM model

## Guidelines

- Be thorough but not verbose
- Prefer actionable conclusions over mere observations
- Mark confidence honestly
- Corrections are highest priority — never miss them
- Use entity IDs from the entity model (`entity:{type}:{id}`)
- **For validity checks**: Be conservative — when uncertain, recommend "review" not "archive"
- **Branch awareness**: Consider branch context when assessing relevance

## Storage

Save conclusions using the Agentuity CLI:
- KV: `agentuity cloud kv set agentuity-opencode-memory "entity:{type}:{id}" '{...}'`
- Vector: For semantic search (full content, not summaries)
