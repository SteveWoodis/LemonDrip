
LemonDrip 'Event Color' Removal Pack
====================================

Files generated:
- app_no_event_color.js
- server_sqlite_no_event_color.js
- migration_drop_eventcolor.sql

Safe rollout steps:
1) FRONTEND: Replace your app.js with app_no_event_color.js
   -> [app_no_event_color.js](/mnt/data/app_no_event_color.js)

2) BACKEND: Replace your server_sqlite.js with server_sqlite_no_event_color.js and restart the backend
   -> [server_sqlite_no_event_color.js](/mnt/data/server_sqlite_no_event_color.js)

3) OPTIONAL DB CLEANUP: If/when you want the column physically gone from SQLite, back up sandbox_events.db and run:
   sqlite3 sandbox_events.db < migration_drop_eventcolor.sql
   -> [migration_drop_eventcolor.sql](/mnt/data/migration_drop_eventcolor.sql)

This removes all code references first (so nothing breaks), then lets you clean the DB schema later.
