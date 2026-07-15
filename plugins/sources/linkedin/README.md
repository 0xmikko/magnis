# linkedin — read-only LinkedIn source connector (via anysite.io)

Feeds the `linkedin` surface with profile + post envelopes for the user's TRACKED
LinkedIn handles only (DEC-8 / INV-1). Read-only (INV-5): the only tool is
`magnis.sync.fetch`. LinkedIn has no first-party read API for this, so the
connector reads through **anysite.io** (DEC-13).

## Auth

- Header: **`access-token: <key>`** (NOT `Authorization: Bearer`).
- Key env var: **`SOURCE_LINKEDIN_ANYSITE_KEY`** (DEC-6). Host-injected per call
  via `_meta` (cred-less initialize; missing key → fetch-time auth error, DEC-7).

## Endpoints (anysite.io, base `https://api.anysite.io`)

Both are `POST` with a JSON body. Ported from content-os `src/anysite/service.ts`.

| Call | Path | Body | Returns |
|---|---|---|---|
| Resolve profile | `/api/linkedin/user` | `{ "user": "<handle-or-url>" }` | profile object incl. the `fsd_profile` **urn** |
| Recent posts | `/api/linkedin/user/posts` | `{ "urn": "<fsd_profile-urn>", "count": <n> }` | array of post objects |

Resolve **must** run first — `/user/posts` is keyed by the `fsd_profile` urn
returned from `/user`, not the handle.

### Response shapes (as documented in content-os; CONFIRM via the spike)

`KolProfile` ← `/api/linkedin/user`:
`name`, `urn` (`{ type, value }` or bare string → use `.value`), `headline`,
`follower_count`, `url`.

`KolPost` ← `/api/linkedin/user/posts` (post array under `posts` / `data` /
`elements`, or a bare array):
`urn` (activity urn = permalink target), `share_url`/`url`, `text`/`commentary`/
`content`, `created_at` (epoch), `reactions` (array of `{type,count}` → sum),
`comment_count`, `share_count`/`repost_count`, `is_empty_repost`.

These map onto `linkedin.profile` / `linkedin.post` exactly like the X connector
(S5 does the mapping).

## Verified (S4 spike — DEC-13) — ✅ CONFIRMED LIVE (2026-07-01)

Ran against a live anysite key (`williamhgates`); the full connector fetch
(`fetchLinkedIn`) produced correct `linkedin.profile` + `linkedin.post` envelopes.

```bash
SOURCE_LINKEDIN_ANYSITE_KEY=... bun run scripts/anysite-poc.ts <handle-or-url>
```

- [x] `/api/linkedin/user` returns the `fsd_profile` urn (`urn.value`), `name`,
      `follower_count`, `headline`, `url` — all mapped.
- [x] `/api/linkedin/user/posts` returns a `posts[]` keyed by that urn; each post
      has `urn` (`{type:"activity",value}`), `share_url`, `text`, `comment_count`,
      `share_count`, `reactions[]` — all mapped (reactions summed → likes).
- [x] **created_at is epoch SECONDS**, not ms (spike-caught bug → fixed:
      `toIso` in `fetch.ts` normalises, regression-locked in the fetch test).
- [ ] **Price per call / rate limit / coverage**: metered (X's sibling returned
      `402 credits depleted` — anysite bills per call). Exact per-call price + rate
      cap still TBD; monitor usage. Coverage confirmed for public profiles.

Endpoints + mapping are CONFIRMED. The catalog entry can be flipped to
`available = true` once you've accepted the anysite pricing/rate posture; it
stays `false` today only as a cost gate, not a functional one (the connector
loads and fetches whenever `ENABLED_SOURCES` + the key are present). No live
anysite call is made in any test (INV-6); the spike is operator-run.
