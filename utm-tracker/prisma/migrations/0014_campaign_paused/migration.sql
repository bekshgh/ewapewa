-- One word for a stopped campaign: the buttons wrote "stopped", the form "paused".
UPDATE "Campaign" SET "status" = 'paused' WHERE "status" = 'stopped';
