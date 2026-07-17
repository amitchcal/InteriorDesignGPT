-- 0007_profile_on_signup.sql
--
-- Task 2: "on first login create a `profiles` row".
--
-- Done as a trigger on auth.users rather than in application code: signups
-- arrive via password, magic link, and OAuth callbacks, and a trigger covers
-- every path including ones added later. App-side creation would have to be
-- repeated in each, and would silently miss users created from the dashboard
-- or the admin API.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    -- OAuth providers populate differing metadata keys; fall back through them.
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    )
  )
  on conflict (user_id) do nothing;  -- idempotent: never block a signup
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
