import { runConceptEngine } from "@/lib/engines/concept";
import { loadMarketProfile } from "@/lib/market/load";
import { conceptSchema, type Concept } from "@/types/concept";
import { dnaSchema } from "@/types/dna";
import { intakeSchema } from "@/types/project";
import type { JobHandler } from "../types";

/**
 * Concept job — the run+persist half of the old inline route, now on the worker.
 * The route keeps the cheap gate precondition and enqueues; this does the
 * 2-minute engine call and the versioned write.
 */
export const conceptHandler: JobHandler = async (svc, job) => {
  const projectId = job.project_id;
  if (!projectId) throw new Error("concept job: missing project_id");
  const onlyRoom = (job.payload.room as string | undefined) ?? null;

  const { data: project } = await svc
    .from("projects")
    .select("id, market_code, intake, status")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error(`concept job: project ${projectId} gone`);

  const { data: rooms } = await svc
    .from("rooms")
    .select("name, length, width, ceiling_ht, unit, meta")
    .eq("project_id", projectId);

  const profile = await loadMarketProfile(svc, project.market_code);
  const intake = intakeSchema.parse(project.intake);

  const { data: latest } = await svc
    .from("design_concepts")
    .select("version, concept")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Designer-DNA (E2-5): if the project references a completed profile, pass it
  // so the concept favours this designer's materials/palette over generic
  // style. A profile whose dna hasn't been generated yet is skipped, not waited
  // on — the concept still runs.
  let designerDna: unknown = undefined;
  if (intake.dna_id) {
    const { data: dnaRow } = await svc
      .from("designer_dna_profiles")
      .select("dna")
      .eq("id", intake.dna_id)
      .maybeSingle();
    // The row starts with an empty {} placeholder until its job fills it —
    // validate so a not-yet-generated profile isn't passed as a DNA.
    const parsed = dnaRow?.dna ? dnaSchema.safeParse(dnaRow.dna) : null;
    if (parsed?.success) designerDna = parsed.data;
  }

  const generated = await runConceptEngine({
    market_profile: profile.config,
    intake: {
      floor_plan: rooms ?? [],
      client_brief: intake.client_brief,
      preferences: intake.preferences,
      cultural_overrides: intake.cultural_overrides,
    },
    designer_dna: designerDna,
    only_room: onlyRoom,
  });

  // Single-room re-run merges into the previous version (E2-4).
  let concept: Concept = generated;
  if (onlyRoom && latest) {
    const base = conceptSchema.parse(latest.concept);
    const fresh =
      generated.rooms.find((r) => r.name === onlyRoom) ?? generated.rooms[0];
    concept = {
      ...base,
      rooms: base.rooms.map((r) => (r.name === onlyRoom ? fresh : r)),
      assumptions: base.assumptions,
    };
  }

  const version = (latest?.version ?? 0) + 1;

  const { error } = await svc
    .from("design_concepts")
    .insert({ project_id: projectId, version, concept });
  if (error) throw new Error(`concept job: persist failed: ${error.message}`);

  if (project.status === "validated") {
    await svc.from("projects").update({ status: "concept" }).eq("id", projectId);
  }

  return { version, rooms: concept.rooms.length };
};
