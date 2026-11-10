package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
)

// GetPurchaseOrder loads a purchase order and its order lines by PO number.
func (s *Store) GetPurchaseOrder(ctx context.Context, poNumber string) (*PurchaseOrder, error) {
	if err := s.available(); err != nil {
		return nil, err
	}

	var (
		po                 PurchaseOrder
		expected           pgtype.Text
		cancelledAt        pgtype.Text
		cancellationReason pgtype.Text
	)
	err := s.db.QueryRow(ctx, `
		SELECT id::text, po_number, supplier_name, site_name, status,
		       expected_delivery_date::text, cancelled_at::date::text,
		       cancellation_reason
		FROM purchase_orders
		WHERE po_number = $1`,
		poNumber,
	).Scan(
		&po.ID,
		&po.PONumber,
		&po.SupplierName,
		&po.SiteName,
		&po.Status,
		&expected,
		&cancelledAt,
		&cancellationReason,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query purchase order: %w", err)
	}

	if expected.Valid {
		parsed, parseErr := time.Parse("2006-01-02", expected.String)
		if parseErr != nil {
			return nil, fmt.Errorf("parse expected delivery date: %w", parseErr)
		}
		po.ExpectedDeliveryDate = &parsed
	}
	if cancelledAt.Valid {
		parsed, parseErr := time.Parse("2006-01-02", cancelledAt.String)
		if parseErr != nil {
			return nil, fmt.Errorf("parse cancellation date: %w", parseErr)
		}
		po.CancelledAt = &parsed
	}
	if cancellationReason.Valid {
		po.CancellationReason = &cancellationReason.String
	}

	items, err := s.getPurchaseOrderItems(ctx, po.ID)
	if err != nil {
		return nil, err
	}
	po.Items = items

	return &po, nil
}

// ListPurchaseOrders loads all purchase orders and their order lines in the
// dashboard display order.
func (s *Store) ListPurchaseOrders(ctx context.Context) ([]PurchaseOrder, error) {
	if err := s.available(); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id::text, po_number, supplier_name, site_name, status,
		       expected_delivery_date::text, cancelled_at::date::text,
		       cancellation_reason
		FROM purchase_orders
		ORDER BY CASE status
			WHEN 'open' THEN 0
			WHEN 'partially_received' THEN 1
			WHEN 'closed' THEN 2
			WHEN 'cancelled' THEN 3
			ELSE 4
		END,
		expected_delivery_date ASC NULLS LAST,
		po_number ASC`)
	if err != nil {
		return nil, fmt.Errorf("query purchase orders: %w", err)
	}

	orders := make([]PurchaseOrder, 0)
	orderIndex := make(map[string]int)
	for rows.Next() {
		var (
			po                 PurchaseOrder
			expected           pgtype.Text
			cancelledAt        pgtype.Text
			cancellationReason pgtype.Text
		)
		if err := rows.Scan(
			&po.ID,
			&po.PONumber,
			&po.SupplierName,
			&po.SiteName,
			&po.Status,
			&expected,
			&cancelledAt,
			&cancellationReason,
		); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan purchase order: %w", err)
		}

		if expected.Valid {
			parsed, parseErr := time.Parse("2006-01-02", expected.String)
			if parseErr != nil {
				rows.Close()
				return nil, fmt.Errorf("parse expected delivery date: %w", parseErr)
			}
			po.ExpectedDeliveryDate = &parsed
		}
		if cancelledAt.Valid {
			parsed, parseErr := time.Parse("2006-01-02", cancelledAt.String)
			if parseErr != nil {
				rows.Close()
				return nil, fmt.Errorf("parse cancellation date: %w", parseErr)
			}
			po.CancelledAt = &parsed
		}
		if cancellationReason.Valid {
			po.CancellationReason = &cancellationReason.String
		}
		po.Items = make([]PurchaseOrderItem, 0)

		orderIndex[po.ID] = len(orders)
		orders = append(orders, po)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterate purchase orders: %w", err)
	}
	rows.Close()

	if len(orders) == 0 {
		return orders, nil
	}

	itemRows, err := s.db.Query(ctx, `
		SELECT purchase_order_id::text, id::text, line_number, description,
		       ordered_quantity::text, received_quantity::text, damaged_quantity::text
		FROM purchase_order_items
		ORDER BY purchase_order_id, line_number`)
	if err != nil {
		return nil, fmt.Errorf("query all purchase order items: %w", err)
	}

	for itemRows.Next() {
		var (
			orderID                    string
			item                       PurchaseOrderItem
			ordered, received, damaged string
		)
		if err := itemRows.Scan(
			&orderID,
			&item.ID,
			&item.LineNumber,
			&item.Description,
			&ordered,
			&received,
			&damaged,
		); err != nil {
			itemRows.Close()
			return nil, fmt.Errorf("scan purchase order item: %w", err)
		}

		parsedOrdered, parseErr := decimal.NewFromString(ordered)
		if parseErr != nil {
			itemRows.Close()
			return nil, fmt.Errorf("parse ordered quantity: %w", parseErr)
		}
		parsedReceived, parseErr := decimal.NewFromString(received)
		if parseErr != nil {
			itemRows.Close()
			return nil, fmt.Errorf("parse received quantity: %w", parseErr)
		}
		parsedDamaged, parseErr := decimal.NewFromString(damaged)
		if parseErr != nil {
			itemRows.Close()
			return nil, fmt.Errorf("parse damaged quantity: %w", parseErr)
		}

		item.OrderedQuantity = parsedOrdered
		item.ReceivedQuantity = parsedReceived
		item.DamagedQuantity = parsedDamaged

		index, ok := orderIndex[orderID]
		if !ok {
			continue
		}
		orders[index].Items = append(orders[index].Items, item)
	}
	if err := itemRows.Err(); err != nil {
		itemRows.Close()
		return nil, fmt.Errorf("iterate purchase order items: %w", err)
	}
	itemRows.Close()

	return orders, nil
}

func (s *Store) getPurchaseOrderItems(ctx context.Context, purchaseOrderID string) ([]PurchaseOrderItem, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id::text, line_number, description,
		       ordered_quantity::text, received_quantity::text, damaged_quantity::text
		FROM purchase_order_items
		WHERE purchase_order_id = $1::uuid
		ORDER BY line_number`,
		purchaseOrderID,
	)
	if err != nil {
		return nil, fmt.Errorf("query purchase order items: %w", err)
	}
	defer rows.Close()

	items := make([]PurchaseOrderItem, 0)
	for rows.Next() {
		var (
			item              PurchaseOrderItem
			ordered, received string
			damaged           string
		)
		if err := rows.Scan(
			&item.ID,
			&item.LineNumber,
			&item.Description,
			&ordered,
			&received,
			&damaged,
		); err != nil {
			return nil, fmt.Errorf("scan purchase order item: %w", err)
		}

		parsedOrdered, parseErr := decimal.NewFromString(ordered)
		if parseErr != nil {
			return nil, fmt.Errorf("parse ordered quantity: %w", parseErr)
		}
		parsedReceived, parseErr := decimal.NewFromString(received)
		if parseErr != nil {
			return nil, fmt.Errorf("parse received quantity: %w", parseErr)
		}
		parsedDamaged, parseErr := decimal.NewFromString(damaged)
		if parseErr != nil {
			return nil, fmt.Errorf("parse damaged quantity: %w", parseErr)
		}

		item.OrderedQuantity = parsedOrdered
		item.ReceivedQuantity = parsedReceived
		item.DamagedQuantity = parsedDamaged
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate purchase order items: %w", err)
	}

	return items, nil
}

// DeliveryExists reports whether a delivery note is already recorded for a PO.
func (s *Store) DeliveryExists(ctx context.Context, purchaseOrderID, deliveryNoteNumber string) (bool, error) {
	if err := s.available(); err != nil {
		return false, err
	}

	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM deliveries
			WHERE purchase_order_id = $1::uuid
			  AND delivery_note_number = $2
		)`,
		purchaseOrderID,
		deliveryNoteNumber,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check delivery note: %w", err)
	}

	return exists, nil
}

// GetDeliveryByClientRequestID loads a delivery header for idempotent replay.
func (s *Store) GetDeliveryByClientRequestID(ctx context.Context, clientRequestID string) (*Delivery, error) {
	if err := s.available(); err != nil {
		return nil, err
	}
	return s.getDeliveryByClientRequestID(ctx, s.db, clientRequestID)
}

type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (s *Store) getDeliveryByClientRequestID(ctx context.Context, queryer rowQuerier, clientRequestID string) (*Delivery, error) {
	var (
		delivery             Delivery
		clientRequestIDValue pgtype.Text
		voiceTranscript      pgtype.Text
		rawOCRText           pgtype.Text
		deliveryDate         string
	)
	err := queryer.QueryRow(ctx, `
		SELECT d.id::text, d.client_request_id, d.purchase_order_id::text,
		       d.po_number, d.delivery_note_number, d.supplier_name, d.site_name,
		       d.delivery_date::text, d.worker_name, d.worker_identifier,
		       d.voice_transcript, d.raw_ocr_text, d.created_at, po.status
		FROM deliveries d
		JOIN purchase_orders po ON po.id = d.purchase_order_id
		WHERE d.client_request_id = $1`,
		clientRequestID,
	).Scan(
		&delivery.ID,
		&clientRequestIDValue,
		&delivery.PurchaseOrderID,
		&delivery.PONumber,
		&delivery.DeliveryNoteNumber,
		&delivery.SupplierName,
		&delivery.SiteName,
		&deliveryDate,
		&delivery.WorkerName,
		&delivery.WorkerIdentifier,
		&voiceTranscript,
		&rawOCRText,
		&delivery.CreatedAt,
		&delivery.OrderStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query delivery by client request id: %w", err)
	}

	if clientRequestIDValue.Valid {
		delivery.ClientRequestID = &clientRequestIDValue.String
	}
	if voiceTranscript.Valid {
		delivery.VoiceTranscript = &voiceTranscript.String
	}
	if rawOCRText.Valid {
		delivery.RawOCRText = &rawOCRText.String
	}

	parsedDate, parseErr := time.Parse("2006-01-02", deliveryDate)
	if parseErr != nil {
		return nil, fmt.Errorf("parse delivery date: %w", parseErr)
	}
	delivery.DeliveryDate = parsedDate

	return &delivery, nil
}

type lockedPurchaseOrderItem struct {
	ordered  decimal.Decimal
	received decimal.Decimal
}

// CreateDelivery inserts a delivery, its items, and updates the purchase order
// counters and status in one transaction. It re-checks the order status,
// duplicate note, and remaining quantities under row locks.
func (s *Store) CreateDelivery(ctx context.Context, in CreateDeliveryInput) (*CreateDeliveryResult, error) {
	if err := s.available(); err != nil {
		return nil, err
	}
	if len(in.Items) == 0 {
		return nil, ErrInvalidQuantity
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin delivery transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status string
	err = tx.QueryRow(ctx, `
		SELECT status
		FROM purchase_orders
		WHERE id = $1::uuid
		FOR UPDATE`,
		in.PurchaseOrderID,
	).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lock purchase order: %w", err)
	}

	// Check the idempotency key after the PO lock so a concurrent original
	// transaction has committed before a retry looks for its row. This also
	// covers the case where the original delivery closed the PO.
	if in.ClientRequestID != nil {
		existing, lookupErr := s.getDeliveryByClientRequestID(ctx, tx, *in.ClientRequestID)
		if lookupErr == nil {
			return &CreateDeliveryResult{
				Delivery:         existing,
				IdempotentReplay: true,
			}, nil
		}
		if !errors.Is(lookupErr, ErrNotFound) {
			return nil, lookupErr
		}
	}

	if status != "open" && status != "partially_received" {
		return nil, ErrOrderNotOpen
	}

	var noteExists bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM deliveries
			WHERE purchase_order_id = $1::uuid
			  AND delivery_note_number = $2
		)`,
		in.PurchaseOrderID,
		in.DeliveryNoteNumber,
	).Scan(&noteExists)
	if err != nil {
		return nil, fmt.Errorf("check duplicate delivery note: %w", err)
	}
	if noteExists {
		return nil, ErrDuplicateDelivery
	}

	lockedItems, err := s.lockPurchaseOrderItems(ctx, tx, in.PurchaseOrderID)
	if err != nil {
		return nil, err
	}

	seenItems := make(map[string]struct{}, len(in.Items))
	for _, item := range in.Items {
		if _, exists := seenItems[item.PurchaseOrderItemID]; exists {
			return nil, ErrDuplicateItem
		}
		seenItems[item.PurchaseOrderItemID] = struct{}{}

		lockedItem, ok := lockedItems[item.PurchaseOrderItemID]
		if !ok {
			return nil, ErrPurchaseOrderItemNotFound
		}
		if !item.NoteQuantity.IsPositive() ||
			item.ReceivedQuantity.IsNegative() ||
			item.DamagedQuantity.IsNegative() {
			return nil, ErrInvalidQuantity
		}
		if item.ReceivedQuantity.Add(item.DamagedQuantity).GreaterThan(item.NoteQuantity) {
			return nil, ErrInvalidQuantity
		}

		remaining := lockedItem.ordered.Sub(lockedItem.received)
		if remaining.IsNegative() {
			remaining = decimal.Zero
		}
		if item.ReceivedQuantity.GreaterThan(remaining) {
			return nil, &QuantityConflictError{
				ItemID:    item.PurchaseOrderItemID,
				Remaining: remaining,
			}
		}
	}

	var (
		deliveryID string
		createdAt  time.Time
	)
	err = tx.QueryRow(ctx, `
		INSERT INTO deliveries (
			client_request_id, purchase_order_id, po_number, delivery_note_number,
			supplier_name, site_name, delivery_date, worker_name, worker_identifier,
			voice_transcript, raw_ocr_text
		)
		VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
		RETURNING id::text, created_at`,
		textValue(in.ClientRequestID),
		in.PurchaseOrderID,
		in.PONumber,
		in.DeliveryNoteNumber,
		in.SupplierName,
		in.SiteName,
		in.DeliveryDate.Format("2006-01-02"),
		in.WorkerName,
		in.WorkerIdentifier,
		textValue(in.VoiceTranscript),
		textValue(in.RawOCRText),
	).Scan(&deliveryID, &createdAt)
	if err != nil {
		switch {
		case isUniqueViolation(err, "deliveries_client_request_id_key") && in.ClientRequestID != nil:
			// The row was inserted by a concurrent retry. Roll back this
			// transaction before reading the winning row through the pool.
			_ = tx.Rollback(ctx)
			existing, getErr := s.GetDeliveryByClientRequestID(ctx, *in.ClientRequestID)
			if getErr != nil {
				return nil, getErr
			}
			return &CreateDeliveryResult{
				Delivery:         existing,
				IdempotentReplay: true,
			}, nil
		case isUniqueViolation(err, "deliveries_po_note_key"):
			return nil, ErrDuplicateDelivery
		default:
			return nil, fmt.Errorf("insert delivery: %w", err)
		}
	}

	for _, item := range in.Items {
		_, err = tx.Exec(ctx, `
			INSERT INTO delivery_items (
				delivery_id, purchase_order_item_id, description, note_quantity,
				received_quantity, damaged_quantity, remarks
			)
			VALUES ($1::uuid, $2::uuid, $3, $4::numeric, $5::numeric, $6::numeric, $7)`,
			deliveryID,
			item.PurchaseOrderItemID,
			item.Description,
			item.NoteQuantity.String(),
			item.ReceivedQuantity.String(),
			item.DamagedQuantity.String(),
			textValue(item.Remarks),
		)
		if err != nil {
			if isUniqueViolation(err, "delivery_items_delivery_po_item_key") {
				return nil, ErrDuplicateItem
			}
			return nil, fmt.Errorf("insert delivery item: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE purchase_order_items
			SET received_quantity = received_quantity + $2::numeric,
			    damaged_quantity = damaged_quantity + $3::numeric
			WHERE id = $1::uuid`,
			item.PurchaseOrderItemID,
			item.ReceivedQuantity.String(),
			item.DamagedQuantity.String(),
		)
		if err != nil {
			return nil, fmt.Errorf("update purchase order item: %w", err)
		}
	}

	var finalStatus string
	err = tx.QueryRow(ctx, `
		UPDATE purchase_orders po
		SET status = CASE
			WHEN po.status = 'cancelled' THEN 'cancelled'
			WHEN NOT EXISTS (
				SELECT 1
				FROM purchase_order_items i
				WHERE i.purchase_order_id = po.id
				  AND i.received_quantity < i.ordered_quantity
			) THEN 'closed'
			WHEN EXISTS (
				SELECT 1
				FROM purchase_order_items i
				WHERE i.purchase_order_id = po.id
				  AND (i.received_quantity > 0 OR i.damaged_quantity > 0)
			) THEN 'partially_received'
			ELSE 'open'
		END,
		updated_at = now()
		WHERE po.id = $1::uuid
		RETURNING status`,
		in.PurchaseOrderID,
	).Scan(&finalStatus)
	if err != nil {
		return nil, fmt.Errorf("recompute purchase order status: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit delivery transaction: %w", err)
	}

	return &CreateDeliveryResult{
		Delivery: &Delivery{
			ID:                 deliveryID,
			ClientRequestID:    in.ClientRequestID,
			PurchaseOrderID:    in.PurchaseOrderID,
			PONumber:           in.PONumber,
			DeliveryNoteNumber: in.DeliveryNoteNumber,
			SupplierName:       in.SupplierName,
			SiteName:           in.SiteName,
			DeliveryDate:       in.DeliveryDate,
			WorkerName:         in.WorkerName,
			WorkerIdentifier:   in.WorkerIdentifier,
			VoiceTranscript:    in.VoiceTranscript,
			RawOCRText:         in.RawOCRText,
			OrderStatus:        finalStatus,
			CreatedAt:          createdAt,
		},
	}, nil
}

func (s *Store) lockPurchaseOrderItems(ctx context.Context, tx pgx.Tx, purchaseOrderID string) (map[string]lockedPurchaseOrderItem, error) {
	rows, err := tx.Query(ctx, `
		SELECT id::text, ordered_quantity::text, received_quantity::text
		FROM purchase_order_items
		WHERE purchase_order_id = $1::uuid
		FOR UPDATE`,
		purchaseOrderID,
	)
	if err != nil {
		return nil, fmt.Errorf("lock purchase order items: %w", err)
	}

	items := make(map[string]lockedPurchaseOrderItem)
	for rows.Next() {
		var id, orderedText, receivedText string
		if err := rows.Scan(&id, &orderedText, &receivedText); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan locked purchase order item: %w", err)
		}

		ordered, parseErr := decimal.NewFromString(orderedText)
		if parseErr != nil {
			rows.Close()
			return nil, fmt.Errorf("parse locked ordered quantity: %w", parseErr)
		}
		received, parseErr := decimal.NewFromString(receivedText)
		if parseErr != nil {
			rows.Close()
			return nil, fmt.Errorf("parse locked received quantity: %w", parseErr)
		}

		items[id] = lockedPurchaseOrderItem{
			ordered:  ordered,
			received: received,
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterate locked purchase order items: %w", err)
	}
	rows.Close()

	return items, nil
}

func textValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}
