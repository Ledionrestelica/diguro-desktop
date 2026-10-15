-- Email verification becomes mandatory for new sign-ups. Accounts that
-- existed before that switch were created by admins or signed up without a
-- code, so treat them as verified rather than locking them out.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
