-- Destructive migration example
ALTER TABLE users DROP COLUMN phone_number;
DROP TABLE audit_logs_2024;
TRUNCATE TABLE session_store;
