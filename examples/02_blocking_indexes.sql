-- Blocking and transactionally invalid index migration
BEGIN;
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX CONCURRENTLY idx_orders_created ON orders(created_at);
COMMIT;
