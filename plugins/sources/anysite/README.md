# Anysite

Read-only source connector built on the [anysite.io](https://anysite.io) data
API. Today it provides one surface — `linkedin`: profiles and recent posts of
the LinkedIn people you opt in to tracking. Untracked handles are never
fetched. The provider can return more than LinkedIn, so further surfaces may be
added later; the surface names the data, the source names the provider.

- Opt-in per contact; only tracked handles are queried
- Feeds the LinkedIn module (profiles + posts)
- Read-only: the only tool is `magnis.sync.fetch`

Set `SOURCE_ANYSITE_API_KEY` (or paste the key in Settings → Sources) to
enable it. Requests are billed to your anysite account.

## Auth

- Header: **`access-token: <key>`** (NOT `Authorization: Bearer`).
- Credential key: **`api_key`**, resolved by the host (vault, then the
  `SOURCE_ANYSITE_API_KEY` env var) and injected per call via `_meta` — the
  connector never stores credentials. `initialize` is credential-less; a
  missing key fails at fetch time with an auth error, not at registration.

## Endpoints (anysite.io, base `https://api.anysite.io`)

Both are `POST` with a JSON body.

| Call | Path | Body | Returns |
|---|---|---|---|
| Resolve profile | `/api/linkedin/user` | `{ "user": "<handle-or-url>" }` | profile object incl. the `fsd_profile` **urn** |
| Recent posts | `/api/linkedin/user/posts` | `{ "urn": "<fsd_profile-urn>", "count": <n> }` | array of post objects |

Resolve **must** run first — `/user/posts` is keyed by the `fsd_profile` urn
returned from `/user`, not the handle.

### Response shapes

`KolProfile` ← `/api/linkedin/user`:
`name`, `urn` (`{ type, value }` or bare string → use `.value`), `headline`,
`follower_count`, `url`, `image` (avatar).

`KolPost` ← `/api/linkedin/user/posts` (post array under `posts` / `data` /
`elements`, or a bare array):
`urn` (activity urn = permalink target), `share_url`/`url`, `text`/`commentary`/
`content`, `created_at` (epoch), `reactions` (array of `{type,count}` → sum),
`comment_count`, `share_count`/`repost_count`, `is_empty_repost`.

These map onto the `linkedin.profile` / `linkedin.post` envelope payloads the
LinkedIn module ingests, mirroring the X connector's shape.

## Verified live (2026-07-01)

Ran against a live anysite key (`williamhgates`); the full connector fetch
produced correct `linkedin.profile` + `linkedin.post` envelopes.

- [x] `/api/linkedin/user` returns the `fsd_profile` urn (`urn.value`), `name`,
      `follower_count`, `headline`, `url` — all mapped.
- [x] `/api/linkedin/user/posts` returns a `posts[]` keyed by that urn; each post
      has `urn` (`{type:"activity",value}`), `share_url`, `text`, `comment_count`,
      `share_count`, `reactions[]` — all mapped (reactions summed → likes).
- [x] **`created_at` is epoch SECONDS**, not ms — the connector normalises to
      ISO, and the fetch test locks the regression.
- [ ] **Price per call / rate limit / coverage**: anysite is metered and bills
      per call; a credit-exhaustion response is treated as a rate limit (back
      off and recover) rather than a fatal auth error. Exact per-call price and
      rate cap still TBD; monitor usage. Coverage confirmed for public
      profiles.

Endpoints and mapping are confirmed. Catalog availability stays off by default
purely as a cost gate, not a functional one — the connector loads and fetches
whenever it is enabled and the key is present. No live anysite call is made in
any test; tests are hermetic, and the live check above is operator-run.
