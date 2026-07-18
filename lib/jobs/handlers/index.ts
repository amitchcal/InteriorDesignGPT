import type { JobHandler, JobKind } from "../types";
import { boqHandler } from "./boq";
import { conceptHandler } from "./concept";
import { dnaHandler } from "./dna";
import { proposalHandler } from "./proposal";

/** Dispatch table — a job's `kind` picks its handler. */
export const handlers: Record<JobKind, JobHandler> = {
  concept: conceptHandler,
  boq: boqHandler,
  proposal: proposalHandler,
  dna: dnaHandler,
};
