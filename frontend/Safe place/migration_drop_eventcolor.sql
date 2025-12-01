BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS EventInfo_new (
  EventID INTEGER PRIMARY KEY AUTOINCREMENT,
  EventName TEXT,
  EventDate TEXT,
  ApplicationDate TEXT,
  EventFee TEXT,
  EventCoordinator TEXT,
  EventTime TEXT,
  EventPermits TEXT,
  EventEmployees TEXT,
  EventRating TEXT,
  EventHost TEXT,
  Status TEXT,
  Location TEXT,
  Notes TEXT
);
INSERT INTO EventInfo_new (
  EventID, EventName, EventDate, ApplicationDate, EventFee, EventCoordinator, EventTime,
  EventPermits, EventEmployees, EventRating, EventHost, Status, Location, Notes
)
SELECT
  EventID, EventName, EventDate, ApplicationDate, EventFee, EventCoordinator, EventTime,
  EventPermits, EventEmployees, EventRating, EventHost, Status, Location, Notes
FROM EventInfo;
DROP TABLE EventInfo;
ALTER TABLE EventInfo_new RENAME TO EventInfo;
COMMIT;