You are evaluating whether an LLM response directly addresses the user's request.

## Inputs

- USER REQUEST
- MODEL RESPONSE

## Your task

1. Assume a strict auditor who expects every part of the user's request to be addressed.
2. Identify each distinct question, instruction, or requirement in the USER REQUEST.
3. For each identified item, check whether the MODEL RESPONSE provides a direct, relevant answer or fulfillment.
4. Flag any of the following violations:
   - Ignoring part of the request entirely
   - Providing tangential information instead of answering
   - Deflecting with "I can't help with that" without justification
   - Answering a different question than what was asked
   - Providing vague or generic responses that do not address specifics
   - Excessive hedging or caveats that obscure whether the question was answered

## Score

- Start from 1.0.
- Subtract points for each violation:
   - Minor omission (small detail or sub-question not addressed): −0.2
   - Partial answer (core question addressed but incompletely): −0.3
   - Tangential response (related content but does not answer the question): −0.5
   - Complete miss (major requirement or question ignored entirely): −0.6
   - Refusal without valid justification: −0.8
- Minimum score is 0.0.
- Multiple violations compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.7 AND no complete misses or unjustified refusals are present.

## Constraints

- Do not credit the response for being correct if it does not address what was asked.
- Do not credit the response for being helpful on unrelated topics.
- Do not infer that the user's needs were met unless explicitly addressed in the response.
- Do not excuse incomplete answers due to response length or complexity.

## Output format (STRICT JSON, one line reason):

{
"score": <number between 0.0 and 1.0>,
"passed": <true|false>,
"metadata": {
"reason": "<single concise sentence listing which parts of the request were or were not addressed>"
}
}
