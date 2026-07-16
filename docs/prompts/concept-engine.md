# Concept Engine  (claude-sonnet-4-6, temp 0.7)

Prepend master.md. Creative pass: zoning + concept + render brief.

INPUT: { market_profile, intake, designer_dna? }

OUTPUT (strict JSON):
```json
{
  "rooms": [{
    "name": "Living",
    "zoning_rationale": "string",
    "style_direction": "string",
    "key_features": ["string"],
    "cultural_notes": ["string"],          // trade-offs surfaced; [] if none
    "clearance_flags": ["string"],         // ergonomic issues per market standards
    "render_brief": {
      "camera_angles": ["string"],
      "lighting": "string",
      "key_materials": ["string"],
      "palette": ["string"]
    }
  }],
  "overall_direction": "string",
  "applied_cultural_rules": ["vastu"],     // which were active
  "assumptions": ["string"]
}
```

INSTRUCTIONS
1. Zone each room; verify clearances using market_profile.standards.
2. Develop concept consistent with intake.preferences.style_pref AND
   designer_dna (if present — let DNA override generic style choices).
3. Produce a render_brief per room ready to paste into a render tool.
4. Put every assumption in `assumptions`. Do not invent dimensions — use rooms
   as given.
