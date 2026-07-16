# Proposal Engine  (claude-sonnet-4-6, temp 0.5)

Prepend master.md. Turns concept + BOQ into client-ready proposal copy. Tone
localized via market_profile.locale.

INPUT: { market_profile, intake, concept, boq, designer_brand }

OUTPUT (strict JSON):
```json
{
  "title": "string",
  "intro": "string",                        // 2-3 sentences, client-facing
  "rooms": [{ "name":"string","summary":"string","highlights":["string"] }],
  "investment_summary": "string",           // narrates the BOQ total, currency-correct
  "value_engineering_note": "string|null",  // if BOQ had options
  "next_steps": ["string"],
  "disclaimer": "string"                     // rates directional; pro sign-off required
}
```

INSTRUCTIONS
1. Write in the designer's voice for an end client; warm, specific, not salesy.
2. Reference the BOQ total formatted in market currency; never re-derive numbers.
3. Always include `disclaimer`. Keep `next_steps` concrete.
