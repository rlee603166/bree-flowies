@AGENTS.md

# bree flowies

Private photo app for close friend groups: members shoot photos into shared **events** through a dispo-camera UI (tiny viewfinder, no review screen). Photos are hidden from *everyone* — including the photographer — until the event "develops" (e.g. next morning), then appear as one merged chronological album. See README.md for the product overview.

## Commands

```sh
npx expo start          # dev server (project includes expo-dev-client — press s to fall back to Expo Go)
npx expo run:ios        # build + install the dev client on the iOS simulator
npx expo run:ios --device   # same, onto a plugged-in iPhone
npx tsc --noEmit        # type-check
npm run lint            # eslint via expo lint
```

The camera needs a real device; on simulators in dev the shutter auto-switches to a fake mode (`src/lib/fake-photo.ts`) that uploads generated placeholder PNGs.

## Architecture

- Expo SDK 56 + expo-router, TypeScript, screens in `src/app/` — `(auth)/sign-in`, `(app)/index` (groups), `(app)/group/[id]` (events + host controls), `(app)/camera/[eventId]`, `(app)/album/[eventId]`.
- All Supabase access goes through `src/lib/api.ts` (client in `src/lib/supabase.ts`, session via `src/lib/auth-context.tsx`). Generated DB types: `src/types/database.ts` — regenerate with the supabase MCP `generate_typescript_types` after schema changes.
- Photo uploads go through the in-memory retry queue in `src/lib/upload-queue.ts` (storage path `{event_id}/{user_id}/{uuid}.{jpg|png}`, then a `photos` row).
- Backend: Supabase project `tbhmcojmczxsoqdstoap` (managed via the supabase MCP server; schema lives in MCP-applied migrations, no SQL files in-repo). Tables: profiles, groups, group_members, events, photos, app_config.

## Hard rules

- **Privacy is enforced by RLS, never the client.** Photo rows and storage objects are SELECT-able only when their event is `ended` and `now() >= develops_at`. Any new photo-related feature must respect this server-side.
- **Never `.select()` after inserting into `photos`** — Postgres checks `INSERT … RETURNING` against SELECT policies, and pre-develop photos are invisible by design, so it fails.
- Develop timing is a developer-only switch in the `app_config` table (`develop_policy` = `next_morning` | `after_end`), applied by the `end_event` RPC via `compute_develops_at()`. Never expose it as a user setting. Fast-forward in dev: `update events set develops_at = now() where id = '…'`.
- Event "developed" state is **derived** (`status = 'ended' and now() >= develops_at`), not a status value.
- Mutations with privilege checks are SECURITY DEFINER RPCs (`join_group`, `end_event`, `event_shot_counts`), not direct table writes. New functions: `set search_path = ''`, and revoke EXECUTE from `anon`/`public` (keep `authenticated` only where the client calls it; `is_group_member` must stay executable by `authenticated` because RLS policies evaluate it as the querying user).
- Test RLS changes with the rolled-back simulation pattern: seed `auth.users`, then inside a DO block `set local role authenticated` + `set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)`, assert, `rollback`. Run the MCP security advisors after migrations.

## Gotchas

- Typed routes (`experiments.typedRoutes`) regenerate only when the dev server boots — after adding/renaming routes, `npx expo start` must run briefly or `tsc` fails on stale route types.
- RN 0.85: `StyleSheet.absoluteFillObject` is gone (use `absoluteFill` or explicit position styles).
- Read files as bytes with `new File(uri).bytes()` from `expo-file-system` (the legacy `FileSystem.*` API throws in SDK 56).
- Supabase email confirmation: the built-in mailer is rate-limited to a few emails/hour. In dev, "Confirm email" should be off (Dashboard → Authentication → Sign In / Up). Before real users: re-enable + custom SMTP.
