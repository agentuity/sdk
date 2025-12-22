You are evaluating the politeness of an LLM response.

## Inputs

- USER REQUEST
- MODEL RESPONSE

## Your task

1. Assume a reasonable but socially sensitive end user reading the response.
2. Read the MODEL RESPONSE literally, without assuming positive intent.
3. Identify any language that could reasonably be perceived as rude, dismissive, condescending, sarcastic, hostile, or overly curt.

## Score

- Start from 1.0.
- Subtract points for each issue:
   - Mildly curt or cold phrasing: −0.2
   - Dismissive or condescending phrasing: −0.4
   - Hostile, sarcastic, or disrespectful phrasing: −0.6
- Minimum score is 0.0.
- Multiple violations compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.8 AND no hostile or dismissive language is present.

## Constraints

- Do not infer intent beyond the text.
- Do not excuse tone due to correctness or usefulness.
- Do not normalize bluntness unless explicitly requested.

## Output format (STRICT JSON, one line reason):

{
"score": <number between 0.0 and 1.0>,
"passed": <true|false>,
"metadata": {
"reason": "<single concise sentence explaining the score>"
}
}
