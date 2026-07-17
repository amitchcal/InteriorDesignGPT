# BOQ + Cost Engine (claude-sonnet-4-6, temp 0.2)

`master.md` is prepended. Deterministic numeric pass. This is the revenue wedge —
accuracy over flair.

Restructured 2026-07-17 so the fenced block is the prompt that is actually sent
(the original's only fenced block was the output *example*). Instructions are
preserved.

**The money arithmetic is recomputed in code.** The model is asked for its own
totals anyway so the two can be compared — see `lib/engines/boq.ts` and the
route. The model's job is the part that needs judgement: deriving quantities
from the concept and the room geometry, choosing item codes, and proposing value
engineering. Multiplying and summing is not that part, and this is the number a
client is quoted.

INPUT: `{ market_profile, intake, concept, rate_library }`

```
TASK
Produce a bill of quantities for this project, costed from the supplied rate
library.

INSTRUCTIONS
1. Derive quantities from `concept` + room geometry (storage running-length,
   false-ceiling area, flooring, paint, electrical/light points). Show the basis
   of any non-obvious quantity in `assumptions`.
2. Use ONLY rates from rate_library. Match item_code where possible. If a needed
   item is absent, estimate from the nearest tier item and flag it in assumptions.
   Never invent a brand price as fact.
3. amount_minor = round(qty * rate_minor). subtotal = sum(amounts).
   tax_minor = round(subtotal * market_profile.tax.default_rate).
   total = subtotal + tax.
4. budget_delta = total - intake.client_brief.budget_total (in minor units).
5. If over budget, return 3 ranked value_engineering options with real
   delta_minor each. If under/at budget, value_engineering = [].
6. All money in integer minor units. Never output floats for money.

ON QUANTITIES
Every quantity must be traceable to a room dimension or a concept feature. Use
the rooms exactly as given — never invent or adjust a dimension to make a number
work. If a quantity rests on an assumption (a wardrobe height, a coat count, a
point density), state that assumption and the arithmetic behind it in
`assumptions`. A quantity nobody can trace back is worse than one that admits
what it assumed.

ON ITEM CODES
Prefer an exact item_code from rate_library. The tier in intake.preferences is
the default, but use a different tier's item where the concept genuinely calls
for it and say so in assumptions. If nothing in the library fits, use the
nearest item, keep its item_code, and flag the substitution — do not invent an
item_code that isn't in the library.

ON VALUE ENGINEERING
Only when over budget. Three options, ranked by saving. Each delta_minor is a
negative integer in minor units and must be a real saving you can justify from
the items you costed — not a round number chosen to look plausible. Say in
`note` what the client gives up. Never propose a saving that breaks an active
cultural rule or a clearance the concept flagged.

OUTPUT
Return ONLY valid JSON in this exact shape. No prose outside JSON, no markdown
fences.
{
  "items": [{
    "room": "Kitchen",
    "item_code": "KIT-MOD-PRM",
    "spec": "Modular kitchen — base + wall (acrylic)",
    "qty": 42.0,
    "unit": "sqft",
    "rate_minor": 230000,
    "amount_minor": 9660000,
    "tier": "premium"
  }],
  "subtotal_minor": 0,
  "tax_minor": 0,
  "total_minor": 0,
  "currency": "INR",
  "budget_total_minor": 0,
  "budget_delta_minor": 0,
  "value_engineering": [
    { "label": "Switch wardrobe to laminate", "delta_minor": -120000, "note": "string" }
  ],
  "assumptions": ["string"]
}
```
