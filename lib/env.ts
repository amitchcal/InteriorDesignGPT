import { z } from "zod";

/**
 * Env access, validated once. Public vars are inlined at build time, so they
 * must be referenced as literal `process.env.NEXT_PUBLIC_*` properties.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export const env = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/**
 * Server-only vars. Called lazily so importing a module that touches server env
 * from a client bundle fails loudly rather than leaking a value.
 *
 * Vars land here as the tasks that need them arrive:
 * ANTHROPIC_API_KEY (6), RENDER_* (10), STRIPE/RAZORPAY (12), VERCEL_* +
 * JOB_QUEUE_URL (infra).
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser.");
  }

  return serverSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
