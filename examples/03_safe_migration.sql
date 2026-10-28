-- Safe zero-downtime migration conforming to PostgreSQL best practices
SET lock_timeout = '3s';

-- 1. Create index concurrently outside transaction
CREATE INDEX CONCURRENTLY idx_users_active_email ON users(email) WHERE is_active = true;

-- 2. Add foreign key with NOT VALID to prevent write lockup
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

-- 3. Validate constraint asynchronously with weak lock
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_customer;

RESET lock_timeout;
