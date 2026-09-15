# Mock X

X fixture source for tests and e2e: the `x` surface with the live connector's
envelope shapes, no network, no credentials.

Two ways records enter:

- `magnis.sync.fetch` returns the canned profile and posts of the tracked
  fixture handles (one of every rich post format), for e2e.
- the manifest-declared dataset actions `emit_profile` and `emit_post` turn a
  dataset's records into the same profile and post envelopes, so a
  `magnis.dataset/v2` document can load X profiles and posts into Magnis the
  way it loads mail through mock-gmail and chats through mock-telegram. The
  host validates the payloads against `schemas/dataset-actions/*.json`.
