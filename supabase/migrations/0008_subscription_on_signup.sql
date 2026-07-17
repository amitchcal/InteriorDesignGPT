-- 0008_subscription_on_signup.sql
--
-- Task 4 must enforce a project quota (E5-3), but nothing created a
-- subscriptions row — Task 12 builds billing. Without a row there is no quota
-- to read, so every user would be either unlimited or blocked, depending on how
-- the missing row is interpreted. Neither is right.
--
-- Every user therefore gets a default starter subscription at signup, and Task
-- 12's checkout upgrades that row rather than creating one.
--
-- Note on `provider`: 0001 declares it `not null` and documents it as
-- 'stripe' | 'razorpay'. A free plan has no payment provider, so 'none' is used
-- as an explicit sentinel. Task 12 overwrites it on checkout.

-- Extend the signup trigger: profile + default subscription.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    )
  )
  on conflict (user_id) do nothing;

  insert into public.subscriptions (owner_id, plan, provider, status, quota_projects, used_projects)
  values (new.id, 'starter', 'none', 'active', 10, 0);

  return new;
end;
$$;

-- Backfill users created before this migration.
insert into subscriptions (owner_id, plan, provider, status, quota_projects, used_projects)
select u.id, 'starter', 'none', 'active', 10, 0
from auth.users u
where not exists (select 1 from subscriptions s where s.owner_id = u.id);

-- One subscription per owner: the backfill and the trigger must never race into
-- two rows, and the quota check below locks a single row by owner.
create unique index if not exists subscriptions_owner_uidx on subscriptions (owner_id);
