# X (Twitter)

Read-only. Pulls profiles and recent posts for the handles you opt in to
tracking on a contact (Track on X). Only tracked handles are fetched — nothing
else touches the X API.

- App-only Bearer read access (set `SOURCE_X_BEARER_TOKEN`)
- Opt-in per contact; untracked handles are never fetched
- Feeds the X module (profiles + posts)
