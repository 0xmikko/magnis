# Google

Connect a Google account to ingest Gmail threads and Calendar events.
The Google source fulfils both the `email` and `meetings` surfaces,
feeding the Email and Meetings modules from a single OAuth grant.

- OAuth-based connect flow
- Present-to-past sync with covered-range tracking
- Graceful re-auth when tokens expire
