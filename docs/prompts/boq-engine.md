# BOQ + Cost Engine  (claude-sonnet-4-6, temp 0.2)

Prepend master.md. Deterministic numeric pass. This is the revenue wedge —
accuracy over flair.

INPUT: { market_profile, intake, concept, rate_library }
  rate_library: [{ item_code, item_label, category, unit, rate_minor, tier }]

OUTPUT (strict JSON):
```json
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
  "budget_delta_minor": 0,                  // total - budget; negative = under
  "value_engineering": [                    // present only if over budget
    { "label": "Switch wardrobe to laminate", "delta_minor": -120000, "note": "string" }
  ],
  "assumptions": ["string"]
}
```

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
