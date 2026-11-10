-- Development seed data for manual testing.
-- Run with: make seed (Docker) or make seed-local (local PostgreSQL)
--
-- The fixed UUIDs make the sample create payload deterministic. The seed is
-- safe to run more than once; existing rows are left unchanged.

INSERT INTO purchase_orders
    (id, po_number, supplier_name, site_name, status, expected_delivery_date,
     cancelled_at, cancellation_reason)
VALUES
    ('00000000-0000-0000-0000-000000000001',
     'PO-1042', 'Acme Supplies', 'Riverside Tower', 'open', '2026-11-10',
     NULL, NULL),
    ('00000000-0000-0000-0000-000000000002',
     'PO-1039', 'BuildRight Materials', 'Riverside Tower', 'partially_received',
     '2026-11-12', NULL, NULL),
    ('00000000-0000-0000-0000-000000000003',
     'PO-1035', 'SteelWorks Ltd', 'North Wing', 'partially_received',
     '2026-11-08', NULL, NULL),
    ('00000000-0000-0000-0000-000000000004',
     'PO-1028', 'SafeGuard PPE', 'Riverside Tower', 'closed', '2026-11-01',
     NULL, NULL),
    ('00000000-0000-0000-0000-000000000005',
     'PO-1024', 'TilePro Depot', 'Zone B', 'cancelled', '2026-10-28',
     '2026-10-27', 'Duplicate order')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO purchase_order_items
    (id, purchase_order_id, line_number, description, ordered_quantity,
     received_quantity, damaged_quantity)
VALUES
    ('00000000-0000-0000-0000-000000000011',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1042'),
     1, 'Cement bags', 50, 0, 0),
    ('00000000-0000-0000-0000-000000000012',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1042'),
     2, 'Steel rebar', 20, 0, 0),

    ('00000000-0000-0000-0000-000000000021',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1039'),
     1, 'Cement bags', 80, 52, 2),
    ('00000000-0000-0000-0000-000000000022',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1039'),
     2, 'Fine sand', 40, 18, 0),

    ('00000000-0000-0000-0000-000000000031',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1035'),
     1, 'Steel rebar', 40, 15, 3),
    ('00000000-0000-0000-0000-000000000032',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1035'),
     2, 'Anchor bolts', 60, 60, 0),

    ('00000000-0000-0000-0000-000000000041',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1028'),
     1, 'Safety helmets', 60, 60, 0),
    ('00000000-0000-0000-0000-000000000042',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1028'),
     2, 'Work gloves', 100, 100, 0),

    ('00000000-0000-0000-0000-000000000051',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1024'),
     1, 'Ceramic tiles', 120, 0, 0),
    ('00000000-0000-0000-0000-000000000052',
     (SELECT id FROM purchase_orders WHERE po_number = 'PO-1024'),
     2, 'Tile adhesive', 30, 0, 0)
ON CONFLICT (purchase_order_id, line_number) DO NOTHING;
