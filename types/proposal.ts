import { z } from "zod";

/** Proposal Engine output (Task 9), matching docs/prompts/proposal-engine.md. */
export const proposalRoomSchema = z.object({
  name: z.string().min(1),
  summary: z.string(),
  highlights: z.array(z.string()),
});

export const proposalCopySchema = z.object({
  title: z.string().min(1),
  intro: z.string(),
  rooms: z.array(proposalRoomSchema),
  investment_summary: z.string(),
  value_engineering_note: z.string().nullish(),
  next_steps: z.array(z.string()),
  /**
   * Kept so the model writes knowing the framing is advisory, but the PDF
   * renders a canonical disclaimer instead — non-negotiable #3 is not something
   * a model gets to forget.
   */
  disclaimer: z.string(),
});

export type ProposalCopy = z.infer<typeof proposalCopySchema>;
