-- Default theme is now dark for new accounts.
ALTER TABLE "User" ALTER COLUMN "theme" SET DEFAULT 'dark';

-- And switch the (currently single) existing user too — Mario asked for
-- dark to be the default everywhere, including his own account.
UPDATE "User" SET "theme" = 'dark';

-- "Won't do" boolean — task dismissed without doing it. The dropdown
-- menu action flips this; the toggle actions in the server keep it
-- mutually exclusive with `completed`. Defaults to false on every
-- existing row, so this migration is no-op for current data.
ALTER TABLE "Task" ADD COLUMN "wontDo" BOOLEAN NOT NULL DEFAULT false;
