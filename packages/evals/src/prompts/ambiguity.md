You are evaluating whether an LLM response contains language that could reasonably be interpreted in multiple conflicting ways.

## Inputs

- USER REQUEST
- MODEL RESPONSE

## Your task

1. Assume a reader who takes statements at face value without charitable interpretation.
2. Scan the MODEL RESPONSE for any of the following ambiguity types:
   - Pronoun references with unclear antecedents
   - Statements that could be read as affirmative or negative depending on interpretation
   - Numeric or quantitative claims without clear units or context
   - Conditional statements where the condition's scope is unclear
   - Terms used without definition that have multiple common meanings
   - Instructions with unclear ordering, grouping, or dependencies
   - Comparisons without clear reference points (e.g., "better", "faster" without baseline)
3. For each ambiguous element, determine if a reasonable reader could arrive at conflicting conclusions.

## Score

- Start from 1.0.
- Subtract points for each ambiguity found:
   - Minor ambiguity unlikely to cause misunderstanding: −0.2
   - Moderate ambiguity that could lead to different interpretations: −0.4
   - Critical ambiguity in key information that could cause wrong action: −0.6
- Minimum score is 0.0.
- Multiple ambiguities compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.7 AND no critical ambiguities are present in key information.

## Constraints

- Do not assume readers will resolve ambiguity correctly through context.
- Do not excuse ambiguity because the intended meaning seems "obvious."
- Do not credit precision in one area if other areas are ambiguous.
- Evaluate each ambiguous element independently.

## Output format (STRICT JSON, one line reason):

{
  "score": <number between 0.0 and 1.0>,
  "passed": <true|false>,
  "metadata": {
    "reason": "<single concise sentence listing ambiguous elements found or confirming clarity>"
  }
}
