-- +goose Up
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT NOT NULL UNIQUE,
    supplier_name TEXT NOT NULL,
    site_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'partially_received', 'closed', 'cancelled')),
    expected_delivery_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    description TEXT NOT NULL,
    ordered_quantity NUMERIC(12,3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    damaged_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    CONSTRAINT purchase_order_items_po_line_key UNIQUE (purchase_order_id, line_number)
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_request_id TEXT,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    po_number TEXT NOT NULL,
    delivery_note_number TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    site_name TEXT NOT NULL,
    delivery_date DATE NOT NULL,
    worker_name TEXT NOT NULL,
    worker_identifier TEXT NOT NULL,
    voice_transcript TEXT,
    raw_ocr_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deliveries_client_request_id_key UNIQUE (client_request_id),
    CONSTRAINT deliveries_po_note_key UNIQUE (purchase_order_id, delivery_note_number)
);

CREATE TABLE delivery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    purchase_order_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    description TEXT NOT NULL,
    note_quantity NUMERIC(12,3) NOT NULL CHECK (note_quantity > 0),
    received_quantity NUMERIC(12,3) NOT NULL CHECK (received_quantity >= 0),
    damaged_quantity NUMERIC(12,3) NOT NULL CHECK (damaged_quantity >= 0),
    remarks TEXT,
    CONSTRAINT delivery_items_received_damaged_check
        CHECK (received_quantity + damaged_quantity <= note_quantity),
    CONSTRAINT delivery_items_delivery_po_item_key
        UNIQUE (delivery_id, purchase_order_item_id)
);

CREATE INDEX deliveries_po_created_idx
    ON deliveries (purchase_order_id, created_at DESC);

CREATE INDEX deliveries_worker_idx
    ON deliveries (worker_identifier, created_at DESC);

-- +goose Down
DROP TABLE delivery_items;
DROP TABLE deliveries;
DROP TABLE purchase_order_items;
DROP TABLE purchase_orders;
