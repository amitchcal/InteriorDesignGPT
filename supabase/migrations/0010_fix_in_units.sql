-- 0010_fix_in_units.sql
--
-- The IN market profile claimed units:"metric" while contradicting itself:
--   * 51 of its 64 rate_libraries rows are priced imperial (48 sqft, 3 rft)
--   * area_basis is 'carpet_area', which India measures in square feet
--   * Indian floor plans are drawn in feet — the vision parse reads them as ft
--     and Task 5's confirm then refused its own engine's output.
--
-- Left alone this is not cosmetic. The BOQ engine (Task 8) reads
-- `units` to compute quantities and multiplies them by the rate library's
-- per-sqft rates. Under "metric" it would compute m² and cost it at ₹/sqft —
-- every quote wrong by 10.76x, silently. master.md forbids exactly this:
-- "Use market_profile.units throughout; never mix metric/imperial."
--
-- Fixed by data, not code: one jsonb field on one row. No engine changes, which
-- is what E6-1 promises — a market is a profile row plus a rate library.
--
-- US is untouched: it says imperial and is priced imperial. It was already
-- self-consistent.

-- 0002 now seeds 'imperial' at source, so on a fresh database this update is a
-- no-op. It exists for databases already seeded with the wrong value.
update market_profiles
set config = jsonb_set(config, '{units}', '"imperial"'::jsonb),
    version = version + 1,
    updated_at = now()
where market_code = 'IN'
  and config->>'units' = 'metric';

-- ---------------------------------------------------------------------------
-- Convert data captured while the profile said metric.
--
-- Flipping the flag without converting would silently reinterpret every stored
-- 3.2 m ceiling as 3.2 ft — a metre-tall room. The number has to move with the
-- unit.
-- ---------------------------------------------------------------------------
update rooms r
set length     = round((r.length     * 3.28084)::numeric, 2),
    width      = round((r.width      * 3.28084)::numeric, 2),
    ceiling_ht = round((r.ceiling_ht * 3.28084)::numeric, 2),
    unit       = 'ft'
from projects p
where p.id = r.project_id
  and p.market_code = 'IN'
  and r.unit = 'm';

update projects
set intake = jsonb_set(
      jsonb_set(
        intake,
        '{client_brief,ceiling_height}',
        to_jsonb(round(((intake->'client_brief'->>'ceiling_height')::numeric * 3.28084), 2))
      ),
      '{client_brief,ceiling_height_unit}',
      '"ft"'::jsonb
    )
where market_code = 'IN'
  and intake->'client_brief'->>'ceiling_height_unit' = 'm';

-- The profile must never again disagree with the units its own rates are
-- priced in. This is the constraint the original seed violated.
do $$
declare
  v_units text;
  v_area_units int;
begin
  select config->>'units' into v_units from market_profiles where market_code = 'IN';

  select count(*) into v_area_units
  from rate_libraries
  where market_code = 'IN' and unit in ('sqft', 'rft');

  if v_units <> 'imperial' or v_area_units = 0 then
    raise exception
      'IN profile units (%) disagree with its rate library (% imperial-unit rows)',
      v_units, v_area_units;
  end if;
end $$;
