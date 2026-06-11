# bree flowies

A private photo app for close friend groups. When you hang out, someone starts an **event**; everyone shoots photos through a disposable-camera-style interface — tiny viewfinder, no review screen, no feed. Nobody (not even you) can see any photo until the roll **develops** the next morning, when the group wakes up to one merged, chronological album of the night.

## Stack

- **App**: Expo SDK 56 (expo-router, TypeScript), `expo-camera`, `expo-image`
- **Backend**: Supabase (project `tbhmcojmczxsoqdstoap`) — Postgres + RLS, Auth (email/password), Storage
- The schema lives in Supabase migrations (applied via MCP). The privacy rules are enforced **server-side by RLS**: photo rows and storage objects are only selectable once their event is ended and `now() >= develops_at`.

## Run it

```sh
cp .env.example .env   # fill in the Supabase URL + publishable key
npm install
npx expo start         # press i for iOS simulator, or scan the QR with Expo Go
```

The camera needs a real device. On simulators in dev, the shutter automatically switches to a **fake mode** that uploads small generated placeholder images, so the full shoot → develop → album flow stays testable.

> **Dev tip:** email confirmation is currently ON in Supabase Auth, so new accounts must click the email link before signing in. For frictionless test accounts, either disable *Confirm email* (Dashboard → Authentication → Sign In / Up) or confirm via SQL:
> `update auth.users set email_confirmed_at = now() where email = '...';`

## How "developing" works

When the event creator ends an event, the `end_event` RPC stamps `develops_at` using the policy in the `app_config` table. Switching behavior is one SQL update — no app deploy:

```sql
-- next morning at develop_hour (local to the event's timezone) — default
update app_config set value = 'next_morning' where key = 'develop_policy';
update app_config set value = '8' where key = 'develop_hour';

-- or: a fixed delay after the event ends
update app_config set value = 'after_end' where key = 'develop_policy';
update app_config set value = '10' where key = 'develop_delay_hours';
```

To fast-forward a roll while testing:

```sql
update events set develops_at = now() where id = '<event-id>';
```

## Data model

```
profiles       one per auth user (created by trigger on signup)
groups         join_code is the invite; creator auto-added as host
group_members  membership; RLS helper is_group_member() is SECURITY DEFINER
events         status active|ended, one active per group, develops_at stamped on end
photos         storage_path = {event_id}/{user_id}/{uuid}.{jpg|png}
app_config     developer-only knobs (develop policy)
```

Key RLS rules:
- groups/events/photos visible to group members only; join by code goes through the `join_group` RPC
- photos **insert**: only your own, only into an active event of your group
- photos **select** (and storage reads / signed URLs): only after develop — no exceptions, including the photographer
- never `.select()` after inserting a photo: `RETURNING` is checked against the SELECT policy and will fail by design

## v1 scope

Groups (create/join by code), events (start/end by creator), the dispo camera (tiny viewfinder, flash, flip, shot counter, background upload queue with retry), and the developed album (chronological grid + fullscreen pager). Deliberately later: reactions/comments, "roll is ready" push notifications, best-of votes, avatars.
