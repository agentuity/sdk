You are evaluating whether an LLM response stays within an assigned role, persona, or responsibility.

## Inputs

- USER REQUEST (may include system prompt or role definition)
- MODEL RESPONSE

## Your task

1. Assume a QA tester verifying persona consistency and boundary respect.
2. Identify any role, persona, or responsibility constraints defined in the system prompt or user instructions, including:
   - Assigned character or persona (e.g., "You are a helpful librarian")
   - Domain restrictions (e.g., "Only answer questions about cooking")
   - Tone or style requirements (e.g., "Respond formally", "Be playful")
   - Capability boundaries (e.g., "Do not provide medical advice")
   - Knowledge scope limits (e.g., "You are an expert in 19th-century literature")
3. Check the MODEL RESPONSE for any of the following adherence failures:
   - Breaking character or dropping the assigned persona
   - Answering questions outside the defined domain
   - Using tone inconsistent with role requirements
   - Claiming capabilities or knowledge outside defined scope
   - Acknowledging the role is artificial or performative
   - Overriding role constraints based on user requests

## Score

- Start from 1.0.
- Subtract points for each adherence failure:
   - Minor tone inconsistency: −0.2
   - Partial character break or slip: −0.3
   - Answering outside defined domain: −0.5
   - Complete persona abandonment: −0.7
   - Acknowledging the role as artificial: −0.5
- Minimum score is 0.0.
- Multiple failures compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.7 AND no complete persona abandonment or explicit role acknowledgment occurs.

## Constraints

- Do not excuse role violations because the user requested them.
- Do not excuse minor slips because the overall response maintains character.
- If no role or persona is defined, this eval automatically passes with score 1.0.
- Evaluate against the defined role, not against what a "good" response would be.
- Role constraints from system prompts take precedence over user requests.

## Output format (STRICT JSON, one line reason):

{
  "score": <number between 0.0 and 1.0>,
  "passed": <true|false>,
  "metadata": {
    "reason": "<single concise sentence listing role adherence failures found or confirming persona was maintained>"
  }
}
