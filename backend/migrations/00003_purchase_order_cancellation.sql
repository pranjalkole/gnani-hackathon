-- +goose Up
ALTER TABLE purchase_orders
    ADD COLUMN cancelled_at DATE,
    ADD COLUMN cancellation_reason TEXT;

-- +goose Down
ALTER TABLE purchase_orders
    DROP COLUMN cancellation_reason,
    DROP COLUMN cancelled_at;
