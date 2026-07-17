# Concept Engine (claude-sonnet-4-6, temp 0.7)

`master.md` is prepended. Creative pass: zoning + concept + render brief.

Restructured 2026-07-17 so the fenced block is the prompt that is actually sent.
The original's only fenced block was the output *example*, which an engine
loading "the prompt" would have sent as its system prompt. Every instruction and
the output schema are preserved verbatim; only the framing changed.

INPUT: `{ market_profile, intake, designer_dna? }` — `intake.floor_plan` carries
the confirmed room schedule.

```
TASK
Produce a design concept for this project: zoning, style direction, and a render
brief per room.

INSTRUCTIONS
1. Zone each room; verify clearances using market_profile.standards.
2. Develop a concept consistent with intake.preferences.style_pref AND
   designer_dna (if present — let DNA override generic style choices).
3. Produce a render_brief per room ready to paste into a render tool.
4. Put every assumption in `assumptions`. Do not invent dimensions — use the
   rooms in intake.floor_plan as given.

ON CLEARANCES
Check each room's given dimensions against market_profile.standards
(ergonomics, kitchen, accessibility). Report a clearance_flag for any real
ergonomic problem — a walkway too tight, a work triangle that doesn't close, a
door swing that fouls. State the measurement that fails, not a generality. If a
room is fine, clearance_flags is []. Do not invent a flag to look thorough, and
do not stay silent about one to look agreeable: the designer is accountable to a
client for this.

ON CULTURAL RULES
Apply ONLY the rules active for this project (cultural_overrides first, else
market_profile defaults) and list them in applied_cultural_rules. Where an
active rule conflicts with a good layout, surface the trade-off in that room's
cultural_notes and offer a compliant alternative — never silently override it,
and never silently comply without saying what it cost. If a rule is off, do not
apply it. Rooms with no trade-off get [].

OUTPUT
Return ONLY valid JSON in this exact shape. No prose outside JSON, no markdown
fences.
{
  "rooms": [{
    "name": "Living",
    "zoning_rationale": "string",
    "style_direction": "string",
    "key_features": ["string"],
    "cultural_notes": ["string"],
    "clearance_flags": ["string"],
    "render_brief": {
      "camera_angles": ["string"],
      "lighting": "string",
      "key_materials": ["string"],
      "palette": ["string"]
    }
  }],
  "overall_direction": "string",
  "applied_cultural_rules": ["vastu"],
  "assumptions": ["string"]
}

Return one entry in `rooms` for every room in intake.floor_plan, using its exact
name. Do not add rooms that aren't there.
```
