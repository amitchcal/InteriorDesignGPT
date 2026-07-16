# /lib/engines

One file per engine. Each loads its prompt text from `/docs/prompts` and
validates its JSON output against a zod schema **before** persisting.

Engines are separate, single-purpose calls — do not merge them
(CLAUDE.md non-negotiable #4). No Claude call happens outside this directory.

| File | Task | Model | Prompts |
|---|---|---|---|
| `validation.ts` | 6 | `claude-haiku-4-5` | `master.md` + `dna-and-validation.md` (validation section) |
| `concept.ts` | 7 | `claude-sonnet-4-6` | `master.md` + `concept-engine.md` |
| `boq.ts` | 8 | `claude-sonnet-4-6` (temp 0.2) | `master.md` + `boq-engine.md` |
| `proposal.ts` | 9 | `claude-sonnet-4-6` | `master.md` + `proposal-engine.md` |
| `dna.ts` | 11 | `claude-sonnet-4-6` | `master.md` + `dna-and-validation.md` (DNA section) |

`claude-opus-4-8` is available as an optional escalation for hard design
reasoning. Engine system prompts are large and stable — use prompt caching
(docs/infra.md: the single biggest cost lever).
