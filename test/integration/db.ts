import { Pool, type PoolClient } from "pg";

/**
 * Direct Postgres access for RLS/function regression tests. Connects to the
 * local Supabase DB. The port is Supabase's default local DB port; override with
 * TEST_DATABASE_URL if yours differs.
 */
const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// allowExitOnIdle lets the process exit when clients are idle, so no test file
// has to call pool.end() (which would break the next file — the pool is shared).
export const pool = new Pool({ connectionString: CONNECTION, allowExitOnIdle: true });

/** Run as the postgres superuser (setup, seeding, assertions bypassing RLS). */
export async function asPostgres<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Run a function as an authenticated user, inside a transaction that is always
 * rolled back — so RLS applies exactly as PostgREST would apply it, and no test
 * data persists. Mirrors the manual `set local role authenticated` +
 * `request.jwt.claims` pattern used during the build.
 */
export async function asUser<T>(
  userId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Run as the anon role (unauthenticated). */
export async function asAnon<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role anon");
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ role: "anon" })],
    );
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** A stable set of test users created once, reused across tests. */
export const TEST_USERS = {
  owner: "aaaaaaaa-0000-4000-8000-000000000001",
  designer: "aaaaaaaa-0000-4000-8000-000000000002",
  viewer: "aaaaaaaa-0000-4000-8000-000000000003",
  outsider: "aaaaaaaa-0000-4000-8000-000000000004",
} as const;

/** Insert the test users (fires the profile/subscription trigger). Idempotent. */
export async function ensureTestUsers(): Promise<void> {
  await asPostgres(async (c) => {
    for (const id of Object.values(TEST_USERS)) {
      await c.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now(), now())
         on conflict (id) do nothing`,
        [id, `${id}@test.dev`],
      );
    }
  });
}

export async function cleanupTestUsers(): Promise<void> {
  await asPostgres(async (c) => {
    await c.query("delete from auth.users where id = any($1::uuid[])", [
      Object.values(TEST_USERS),
    ]);
  });
}
