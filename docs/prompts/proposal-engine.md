# Proposal Engine (claude-sonnet-4-6, temp 0.5)

`master.md` is prepended. Turns concept + BOQ into client-ready proposal copy.
Tone localized via `market_profile.locale`.

Restructured 2026-07-17 so the fenced block is the prompt actually sent (its only
fenced block was the output *example* — the same defect as concept-engine.md,
boq-engine.md and dna-and-validation.md). Instructions preserved.

Money reaches this engine **pre-formatted** (`₹17,93,471.38`), never as raw minor
units. The prompt's own rule is "never re-derive numbers", and Task 8 measured
what happens when this model does arithmetic: every total wrong, the worst by
₹1.68 lakh. It is given the string to quote and asked not to compute.

The `disclaimer` the model returns is **not** what gets rendered. Non-negotiable
#3 makes the advisory disclaimer mandatory on every proposal, and a mandatory
legal line cannot depend on a model remembering to include it — the PDF renders
a canonical disclaimer from the locale's message catalogue. The field is kept
here so the model still writes the proposal knowing the framing is advisory.

INPUT: `{ market_profile, intake, concept, boq, designer_brand }`

```
TASK
Write the client-facing copy for this proposal.

INSTRUCTIONS
1. Write in the designer's voice for an end client; warm, specific, not salesy.
2. Reference the BOQ total formatted in market currency; never re-derive numbers.
3. Always include `disclaimer`. Keep `next_steps` concrete.

ON NUMBERS
Every money figure you need is supplied pre-formatted in `boq`. Quote those
strings exactly as given. Do not add, subtract, re-total, or convert anything —
if a number you want isn't supplied, write the sentence without it.

ON TONE
This is the document that wins or loses the job. Write what this specific home
gets — the rooms, the materials, the decisions — not what any project would get.
No superlatives the drawings don't support. If the concept flagged a clearance
issue or a cultural trade-off, the proposal does not pretend otherwise; say what
was decided and why, in a client's language rather than a builder's.

OUTPUT
Return ONLY valid JSON in this exact shape. No prose outside JSON, no markdown
fences.
{
  "title": "string",
  "intro": "string",
  "rooms": [{ "name": "string", "summary": "string", "highlights": ["string"] }],
  "investment_summary": "string",
  "value_engineering_note": "string|null",
  "next_steps": ["string"],
  "disclaimer": "string"
}
Return one entry in `rooms` for each room in the concept, using its exact name.
`value_engineering_note` is null when the BOQ carried no options.
```
