# X Posting Calendar

A bare-bones social media posting calendar for X (Twitter), optimized for B2B / dev / AI startup content. Shows good and bad times to post based on audience research, with an AI agent that suggests ideal posting slots based on content type. This is the MVP; the agent will become more complex as we build out the project.

## What It Is

- A single-page HTML/CSS/JS weekly calendar grid showing time quality (peak / good / okay / low ROI)
- An AI agent that uses the Anthropic API (Claude Sonnet) to suggest posting times

---

## Frontend (index.html)

A single self-contained HTML file. No dependencies, no bundler.

**Calendar grid:**

- Days as columns (Mon–Sun), hours as rows (8 AM–10 PM)
- Each cell colored by posting quality:
   - Peak (bright green) — Tue/Wed/Thu in prime windows + evening discourse
   - Good (dark green) — Tier 1 days in secondary windows
   - Okay (amber) — Tier 2 days (Mon/Fri) in valid windows; Sun 9 PM
   - Low ROI (dark) — everything else
- Hover tooltips with window name and content type recommendation

**Agent panel:**

- Dropdown for content type (Launch, Demo, Thread, Opinion, Poll, Hiring, Metrics, Meme, Vision)
- Optional notes and available slots fields
- Calls the agent and displays the response
- Passes `sessionId` between calls so the agent remembers previous suggestions in the session

**Posting time data (baked into the JS):**

| Window              | Hours         | Days     | Best for                              |
| ------------------- | ------------- | -------- | ------------------------------------- |
| Morning Discovery   | 8:30–10:30 AM | Tue–Thu  | Product drops, launch teasers         |
| Midday Conversation | 12:00–1:30 PM | Tue–Thu  | Questions, polls, takes               |
| Builder Break       | 3:30–5:00 PM  | Tue–Thu  | Threads, demos, dev insights          |
| Peak Discourse      | 8:00–10:30 PM | Tue–Thu  | Narrative threads, opinions, strategy |
| Morning Discovery   | 8:30–10:30 AM | Mon, Fri | Okay (reduced engagement)             |
| Evening Takes       | 8:00–10:30 PM | Mon, Fri | Opinions (any weekday works)          |
| Sunday Evening      | 9:00–10:30 PM | Sun      | Vision threads, reflective posts      |

Top 3 slots: **Tue 9 AM**, **Wed 8:30 PM**, **Thu 4 PM**

---

## AI Agent

A single agent.

**Input** (POST body JSON):

```json
{
	"contentType": "Launch / release",
	"notes": "announcing v2.0, targeting founders",
	"availableSlots": "Tue afternoon, Wed evening",
	"sessionId": "optional-uuid-for-memory"
}
```

**Output:**

```json
{
	"suggestion": "Best slot: Tuesday 9 AM...",
	"sessionId": "uuid"
}
```

**What the agent does:**

1. Generates or receives a `sessionId`
2. Loads past suggestions for that session (from whatever storage you wire up)
3. Calls Claude Sonnet with a system prompt containing the full posting-time research
4. Returns the suggestion and `sessionId`
5. Optionally persists the suggestion so future calls in the same session avoid repeating slots

**System prompt summary:** The agent knows the full posting-time research — best days (Tier 1/2/low), best time windows with content mappings, and the top 3 slots. Given content type + optional notes/slots, it returns 1–3 specific recommendations with reasoning and a tactical tip, under 200 words.

**Model:** `claude-sonnet-4-6`, `max_tokens: 512`

**Environment variable required:** `ANTHROPIC_API_KEY`

---

## Memory / Session State

The agent panel sends a `sessionId` cookie-style — the frontend stores it in a JS variable and passes it on every request. The backend is responsible for loading and saving session history. In the bare version, there's no persistence. To add it:

- **Simple:** Store sessions in a `Map` in memory (lost on restart)
- **Persistent:** Use any KV store (Redis, Upstash, etc.) keyed by `sessionId` with a 24h TTL
- **Schema per entry:** `{ contentType: string, summary: string, ts: string }`

The agent uses past entries to avoid suggesting the same slots twice in a session.

---

## Audience Assumptions

Content is tuned for **B2B / dev / AI startup** accounts targeting builders, founders, engineers, and AI practitioners on X. The timing research is Central Time (Austin). Adjust the time windows in the JS data and the system prompt if your audience or timezone differs.
