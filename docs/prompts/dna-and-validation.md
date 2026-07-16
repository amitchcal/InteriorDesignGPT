# Designer-DNA Engine  (claude-sonnet-4-6 vision, batch)

INPUT: { assets: [image_urls of past projects/moodboards/material sheets] }

OUTPUT (strict JSON):
```json
{
  "preferred_materials": ["walnut","brass","fluted panel"],
  "preferred_colors": ["warm neutral","forest green"],
  "preferred_layout_patterns": ["TV wall feature","arch openings"],
  "signature_elements": ["cove lighting","curved sofa"],
  "style_name": "string",
  "confidence_note": "string"               // honest note on sample sufficiency
}
```
INSTRUCTIONS: Extract recurring choices across the set. With <20 assets, say so
in confidence_note. Do not over-generalize from a single image.

---

# Validation / Intake Gate  (claude-haiku-4-5, cheap)

Runs BEFORE any expensive engine. Cheap gatekeeper.

INPUT: { market_profile, intake }

OUTPUT (strict JSON):
```json
{
  "ok": false,
  "missing": ["budget_total","rooms[2].ceiling_ht"],   // mandatory fields absent
  "cultural_confirmations": ["vastu"],                  // default_on rules to confirm
  "normalized_units": "metric",
  "style_pref_normalized": "indian_contemporary"
}
```
MANDATORY FIELDS: budget_total, market_code, every room ceiling_ht, finish_tier.
If any are missing, ok=false and list them. List every default_on cultural_rule
in cultural_confirmations so the UI can ask the user to confirm on/off.
