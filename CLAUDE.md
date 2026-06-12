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

- Expo SDK 56 + expo-router, TypeScript. Screens in `src/app/`: `(auth)/` = sign-in, sign-up, complete-profile; `(app)/` = index (groups), group/[id] (events + host controls), camera/[eventId], album/[eventId], scan (QR), join/[code] (deep-link target), settings.
- All Supabase access goes through `src/lib/api.ts` (client in `src/lib/supabase.ts`, session via `src/lib/auth-context.tsx`). Generated DB types: `src/types/database.ts` — regenerate with the supabase MCP `generate_typescript_types` after schema changes.
- **Onboarding is two-gate.** `(app)/_layout` redirects to sign-in without a session; `(auth)/_layout` redirects into the app only when a session exists *and* the profile is complete. "Complete" = `profiles.first_name` is set — `auth-context` tracks this as `profileComplete`; after writing the profile, call `refreshProfile()`. New email signups land on `complete-profile` before reaching the app.
- **Invites are QR deep links** (`breeflowies://join/<CODE>`, scheme `breeflowies`). `src/lib/invite.ts` builds links and parses scan payloads (`codeFromScan` handles our links, bare codes, or wrapped URLs); `scan.tsx` reads the camera, `join/[code].tsx` is the deep-link landing, `ui/qr-poster.tsx` renders the shareable code. Joining calls the `join_group` RPC.
- **Realtime** lives in `src/lib/realtime.ts`: event start/end via `postgres_changes` on `events`; live shot counts via a `photo_added` **broadcast** on the private `group:<id>` channel — never `postgres_changes` on `photos` (RLS hides pre-develop rows, so they'd never arrive). The camera fires the broadcast on each shot.
- People are shown by name, not `@username` — always format through `displayName` / `fullName` in `src/lib/names.ts` (profiles carry `first_name`, `last_name`, `username`).
- Photo uploads go through the in-memory retry queue in `src/lib/upload-queue.ts` (storage path `{event_id}/{user_id}/{uuid}.{jpg|png}`, then a `photos` row).
- **Styling is dark-only, no Tailwind/NativeWind** (it's a darkroom). Build with `StyleSheet` + the tokens in `src/constants/theme.ts` (`Colors`, `Fonts`, `Spacing`, `Radius`); `useTheme()` always returns `Colors`. Use `themed-text` / `themed-view` and the `ui/` primitives. Fonts ship one file per weight — pick a `Fonts.*` family, never set `fontWeight` alongside it. Design intent: warm near-black + one acid-green accent, mono type for hardware-like text (counters, codes, timers). No animations/haptics.
- Backend: Supabase project `tbhmcojmczxsoqdstoap` (managed via the supabase MCP server; schema lives in MCP-applied migrations, no SQL files in-repo). Tables: profiles, groups, group_members, events, photos, app_config.

## Hard rules

- **Privacy is enforced by RLS, never the client.** Photo rows and storage objects are SELECT-able only when their event is `ended` and `now() >= develops_at`. Any new photo-related feature must respect this server-side.
- **Never `.select()` after inserting into `photos`** — Postgres checks `INSERT … RETURNING` against SELECT policies, and pre-develop photos are invisible by design, so it fails.
- Develop timing is a developer-only switch in the `app_config` table (`develop_policy` = `next_morning` | `after_end`), applied by the `end_event` RPC via `compute_develops_at()`. Never expose it as a user setting. Fast-forward in dev: `update events set develops_at = now() where id = '…'`.
- Event "developed" state is **derived** (`status = 'ended' and now() >= develops_at`), not a status value.
- Mutations with privilege checks are SECURITY DEFINER RPCs (`join_group`, `end_event`, `event_shot_counts`, `delete_account`), not direct table writes. `delete_account` wipes the auth user and all their data (required for App Store 5.1.1(v); surfaced in `settings`). New functions: `set search_path = ''`, and revoke EXECUTE from `anon`/`public` (keep `authenticated` only where the client calls it; `is_group_member` must stay executable by `authenticated` because RLS policies evaluate it as the querying user).
- Test RLS changes with the rolled-back simulation pattern: seed `auth.users`, then inside a DO block `set local role authenticated` + `set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)`, assert, `rollback`. Run the MCP security advisors after migrations.

## Gotchas

- Typed routes (`experiments.typedRoutes`) regenerate only when the dev server boots — after adding/renaming routes, `npx expo start` must run briefly or `tsc` fails on stale route types.
- RN 0.85: `StyleSheet.absoluteFillObject` is gone (use `absoluteFill` or explicit position styles).
- Read files as bytes with `new File(uri).bytes()` from `expo-file-system` (the legacy `FileSystem.*` API throws in SDK 56).
- Supabase email confirmation: the built-in mailer is rate-limited to a few emails/hour. In dev, "Confirm email" should be off (Dashboard → Authentication → Sign In / Up). Before real users: re-enable + custom SMTP.
