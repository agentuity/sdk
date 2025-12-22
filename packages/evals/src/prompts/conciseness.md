You are evaluating whether an LLM response is unnecessarily verbose for the request type.

## Inputs

- USER REQUEST
- MODEL RESPONSE

## Your task

1. Assume a reader who values efficiency and dislikes wasted words.
2. Assess the complexity and scope of the USER REQUEST to determine appropriate response length.
3. Identify any of the following verbosity violations in the MODEL RESPONSE:
   - Repeating the same information in different words
   - Excessive preamble before addressing the request
   - Unnecessary summaries or recaps at the end
   - Filler phrases that add no meaning (e.g., "It's important to note that...", "As you may know...")
   - Over-explanation of simple concepts the user likely understands
   - Including tangential context not required to answer the question
   - Excessive hedging or qualifiers beyond what accuracy requires

## Score

- Start from 1.0.
- Subtract points for each violation:
   - Minor filler or unnecessary phrase: −0.1
   - Redundant paragraph or repeated explanation: −0.3
   - Excessive preamble or postamble (multiple sentences): −0.3
   - Response length grossly disproportionate to request simplicity: −0.5
- Minimum score is 0.0.
- Multiple violations compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.7 AND response length is reasonably proportionate to request complexity.

## Constraints

- Do not penalize thoroughness when the request genuinely requires detailed explanation.
- Do not credit brevity if it sacrifices completeness.
- Do not assume the user wants verbose responses unless explicitly requested.
- Judge verbosity relative to what a competent, efficient response would require.

## Output format (STRICT JSON, one line reason):

{
"score": <number between 0.0 and 1.0>,
"passed": <true|false>,
"metadata": {
"reason": "<single concise sentence describing verbosity issues found or confirming appropriate length>"
}
}
