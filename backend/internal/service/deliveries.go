package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"gnani-hackathon/backend/internal/store"
)

// ErrDuplicateDelivery means the same delivery note is already recorded for
// the purchase order under a different client request ID.
var ErrDuplicateDelivery = errors.New("delivery already recorded")

// DeliveryStore is the persistence surface needed by the delivery service.
type DeliveryStore interface {
	GetPurchaseOrder(ctx context.Context, poNumber string) (*store.PurchaseOrder, error)
	ListPurchaseOrders(ctx context.Context) ([]store.PurchaseOrder, error)
	DeliveryExists(ctx context.Context, purchaseOrderID, deliveryNoteNumber string) (bool, error)
	GetDeliveryByClientRequestID(ctx context.Context, clientRequestID string) (*store.Delivery, error)
	CreateDelivery(ctx context.Context, in store.CreateDeliveryInput) (*store.CreateDeliveryResult, error)
}

// Service contains the delivery-note validation and recording rules.
type Service struct {
	store DeliveryStore
}

// New creates a delivery service backed by store.
func New(store DeliveryStore) *Service {
	return &Service{store: store}
}

// ListOrders returns all purchase orders for the supervisor dashboard.
func (s *Service) ListOrders(ctx context.Context) ([]OrderView, error) {
	orders, err := s.store.ListPurchaseOrders(ctx)
	if err != nil {
		return nil, err
	}

	views := make([]OrderView, 0, len(orders))
	for index := range orders {
		views = append(views, *buildOrderView(&orders[index]))
	}
	return views, nil
}

// ValidateInput is the normalized request for the validation endpoint.
type ValidateInput struct {
	PONumber           string
	DeliveryNoteNumber string
	Supplier           string
	DeliveryDate       string
	Site               string
	Items              []ValidateItem
	RawOCRText         *string
}

// ValidateItem is one line on the scanned note.
type ValidateItem struct {
	POItemID         *string
	Description      string
	Quantity         decimal.Decimal
	ReceivedQuantity *decimal.Decimal
}

// CreateInput is the request for recording a confirmed delivery.
type CreateInput struct {
	ClientRequestID    *string
	PONumber           string
	DeliveryNoteNumber string
	Supplier           string
	DeliveryDate       string
	Site               string
	WorkerName         string
	WorkerIdentifier   string
	VoiceTranscript    *string
	RawOCRText         *string
	Items              []CreateItem
}

// CreateItem is one confirmed delivery line.
type CreateItem struct {
	POItemID         string
	Description      string
	Quantity         decimal.Decimal
	ReceivedQuantity decimal.Decimal
	DamagedQuantity  decimal.Decimal
	Remarks          *string
}

// Issue is one validation finding returned to the app.
type Issue struct {
	Severity    string
	Code        string
	Field       string
	Actual      any
	Expected    any
	ExpectedMax any
	Message     string
}

// ValidationResult is the business result of validating a delivery note.
type ValidationResult struct {
	Valid        bool
	Order        *OrderView
	DeliveryNote DeliveryNoteView
	Issues       []Issue
}

// OrderView is the purchase order information returned to the app.
type OrderView struct {
	PONumber             string
	Supplier             string
	Site                 string
	Status               string
	ExpectedDeliveryDate *string
	CancelledAt          *string
	CancellationReason   *string
	Items                []OrderItemView
}

// OrderItemView is one purchase order line returned to the app.
type OrderItemView struct {
	ID                string
	LineNumber        int
	Description       string
	OrderedQuantity   decimal.Decimal
	ReceivedQuantity  decimal.Decimal
	DamagedQuantity   decimal.Decimal
	RemainingQuantity decimal.Decimal
}

// DeliveryNoteView describes the scanned note in the validation response.
type DeliveryNoteView struct {
	Number          string
	AlreadyRecorded bool
}

// CreateResult is the result of recording a delivery.
type CreateResult struct {
	ID               string
	IdempotentReplay bool
	OrderStatus      string
	RecordedAt       time.Time
}

// ValidationError carries business issues for a failed create. The HTTP layer
// maps it to 422 Unprocessable Entity.
type ValidationError struct {
	Result ValidationResult
}

func (e *ValidationError) Error() string {
	return "delivery validation failed"
}

// Validate checks a scanned note against an open purchase order. Business
// failures are returned in ValidationResult with Valid=false, not as an error.
func (s *Service) Validate(ctx context.Context, in ValidateInput) (ValidationResult, error) {
	result, _, err := s.validate(ctx, in)
	return result, err
}

func (s *Service) validate(ctx context.Context, in ValidateInput) (ValidationResult, *store.PurchaseOrder, error) {
	poNumber := normalizeIdentifier(in.PONumber)
	noteNumber := normalizeIdentifier(in.DeliveryNoteNumber)

	result := ValidationResult{
		DeliveryNote: DeliveryNoteView{Number: noteNumber},
		Issues:       make([]Issue, 0),
	}

	deliveryDate, dateErr := parseDate(in.DeliveryDate)
	if dateErr != nil {
		result.Issues = append(result.Issues, newIssue(
			"INVALID_DATE",
			"deliveryDate",
			strings.TrimSpace(in.DeliveryDate),
			nil,
			nil,
			"Delivery date must use YYYY-MM-DD.",
		))
	}
	if len(in.Items) == 0 {
		result.Issues = append(result.Issues, newIssue(
			"ITEMS_REQUIRED",
			"items",
			nil,
			nil,
			nil,
			"At least one item is required.",
		))
	}

	order, err := s.store.GetPurchaseOrder(ctx, poNumber)
	if errors.Is(err, store.ErrNotFound) {
		result.Issues = append(result.Issues, newIssue(
			"ORDER_NOT_FOUND",
			"poNumber",
			poNumber,
			nil,
			nil,
			fmt.Sprintf("No purchase order found for %s.", poNumber),
		))
		result.Valid = false
		return result, nil, nil
	}
	if err != nil {
		return result, nil, err
	}

	result.Order = buildOrderView(order)

	switch order.Status {
	case "cancelled":
		result.Issues = append(result.Issues, newIssue(
			"ORDER_CANCELLED",
			"poNumber",
			order.Status,
			"open or partially_received",
			nil,
			"Purchase order is cancelled.",
		))
	case "closed":
		result.Issues = append(result.Issues, newIssue(
			"ORDER_NOT_OPEN",
			"poNumber",
			order.Status,
			"open or partially_received",
			nil,
			"Purchase order is already fully received.",
		))
	}

	alreadyRecorded, err := s.store.DeliveryExists(ctx, order.ID, noteNumber)
	if err != nil {
		return result, nil, err
	}
	result.DeliveryNote.AlreadyRecorded = alreadyRecorded
	if alreadyRecorded {
		result.Issues = append(result.Issues, newIssue(
			"DELIVERY_ALREADY_RECORDED",
			"deliveryNoteNumber",
			noteNumber,
			nil,
			nil,
			"This delivery note is already recorded for the purchase order.",
		))
	}

	if normalizeText(in.Supplier) != normalizeText(order.SupplierName) {
		result.Issues = append(result.Issues, newIssue(
			"SUPPLIER_MISMATCH",
			"supplier",
			strings.TrimSpace(in.Supplier),
			order.SupplierName,
			nil,
			"Supplier does not match the purchase order.",
		))
	}
	if normalizeText(in.Site) != normalizeText(order.SiteName) {
		result.Issues = append(result.Issues, newIssue(
			"SITE_MISMATCH",
			"site",
			strings.TrimSpace(in.Site),
			order.SiteName,
			nil,
			"Site does not match the purchase order.",
		))
	}

	if dateErr == nil && order.ExpectedDeliveryDate != nil {
		expected := order.ExpectedDeliveryDate.Format("2006-01-02")
		actual := deliveryDate.Format("2006-01-02")
		if actual != expected {
			result.Issues = append(result.Issues, newWarning(
				"DELIVERY_DATE_VARIANCE",
				"deliveryDate",
				actual,
				expected,
				nil,
				"Delivery date differs from the expected date.",
			))
		}
	}

	matchItems(&result, order, in.Items)

	result.Valid = !hasErrors(result.Issues)
	return result, order, nil
}

func matchItems(result *ValidationResult, order *store.PurchaseOrder, items []ValidateItem) {
	byID := make(map[string]*store.PurchaseOrderItem, len(order.Items))
	byDescription := make(map[string][]*store.PurchaseOrderItem, len(order.Items))
	for index := range order.Items {
		item := &order.Items[index]
		byID[item.ID] = item
		key := normalizeText(item.Description)
		byDescription[key] = append(byDescription[key], item)
	}

	used := make(map[string]struct{}, len(items))
	for index, item := range items {
		field := fmt.Sprintf("items[%d]", index)

		if !item.Quantity.IsPositive() {
			result.Issues = append(result.Issues, newIssue(
				"INVALID_QUANTITY",
				field+".quantity",
				item.Quantity,
				nil,
				nil,
				"Quantity must be greater than zero.",
			))
			continue
		}

		var matched *store.PurchaseOrderItem
		if item.POItemID != nil && strings.TrimSpace(*item.POItemID) != "" {
			matched = byID[normalizeUUID(*item.POItemID)]
			if matched == nil {
				result.Issues = append(result.Issues, newIssue(
					"UNKNOWN_ITEM",
					field+".poItemId",
					strings.TrimSpace(*item.POItemID),
					nil,
					nil,
					fmt.Sprintf("Item does not match any line on %s.", order.PONumber),
				))
				continue
			}
		} else {
			candidates := byDescription[normalizeText(item.Description)]
			switch len(candidates) {
			case 0:
				result.Issues = append(result.Issues, newIssue(
					"UNKNOWN_ITEM",
					field+".description",
					strings.TrimSpace(item.Description),
					nil,
					nil,
					fmt.Sprintf("Item does not match any line on %s.", order.PONumber),
				))
				continue
			case 1:
				matched = candidates[0]
			default:
				result.Issues = append(result.Issues, newIssue(
					"AMBIGUOUS_ITEM",
					field+".description",
					strings.TrimSpace(item.Description),
					nil,
					nil,
					fmt.Sprintf("Item matches multiple lines on %s. Select the PO line.", order.PONumber),
				))
				continue
			}
		}

		if _, exists := used[matched.ID]; exists {
			result.Issues = append(result.Issues, newIssue(
				"DUPLICATE_ITEM",
				field,
				matched.Description,
				nil,
				nil,
				"Two note lines map to the same purchase order line.",
			))
			continue
		}
		used[matched.ID] = struct{}{}

		receivedQuantity := item.Quantity
		if item.ReceivedQuantity != nil {
			receivedQuantity = *item.ReceivedQuantity
		}

		remaining := matched.RemainingQuantity()
		if receivedQuantity.GreaterThan(remaining) {
			result.Issues = append(result.Issues, newIssue(
				"OVER_RECEIPT",
				field+".receivedQuantity",
				receivedQuantity,
				nil,
				remaining,
				"Received quantity exceeds the remaining quantity on the purchase order.",
			))
		}
	}
}

// Create re-validates and records a delivery. Retries with the same
// clientRequestId return the existing delivery instead of inserting again.
func (s *Service) Create(ctx context.Context, in CreateInput) (CreateResult, error) {
	clientRequestID := trimmedPointer(in.ClientRequestID)
	if clientRequestID != nil {
		existing, err := s.store.GetDeliveryByClientRequestID(ctx, *clientRequestID)
		if err == nil {
			return CreateResult{
				ID:               existing.ID,
				IdempotentReplay: true,
				OrderStatus:      existing.OrderStatus,
				RecordedAt:       existing.CreatedAt,
			}, nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return CreateResult{}, err
		}
	}

	validateInput := ValidateInput{
		PONumber:           in.PONumber,
		DeliveryNoteNumber: in.DeliveryNoteNumber,
		Supplier:           in.Supplier,
		DeliveryDate:       in.DeliveryDate,
		Site:               in.Site,
		RawOCRText:         in.RawOCRText,
		Items:              make([]ValidateItem, 0, len(in.Items)),
	}
	for _, item := range in.Items {
		poItemID := item.POItemID
		receivedQuantity := item.ReceivedQuantity
		validateInput.Items = append(validateInput.Items, ValidateItem{
			POItemID:         &poItemID,
			Description:      item.Description,
			Quantity:         item.Quantity,
			ReceivedQuantity: &receivedQuantity,
		})
	}

	result, order, err := s.validate(ctx, validateInput)
	if err != nil {
		return CreateResult{}, err
	}

	for index, item := range in.Items {
		field := fmt.Sprintf("items[%d]", index)
		if !item.Quantity.IsPositive() {
			result.Issues = append(result.Issues, newIssue(
				"INVALID_QUANTITY",
				field+".quantity",
				item.Quantity,
				nil,
				nil,
				"Quantity must be greater than zero.",
			))
		}
		if item.ReceivedQuantity.IsNegative() {
			result.Issues = append(result.Issues, newIssue(
				"INVALID_QUANTITY",
				field+".receivedQuantity",
				item.ReceivedQuantity,
				nil,
				nil,
				"Received quantity must be zero or greater.",
			))
		}
		if item.DamagedQuantity.IsNegative() {
			result.Issues = append(result.Issues, newIssue(
				"INVALID_QUANTITY",
				field+".damagedQuantity",
				item.DamagedQuantity,
				nil,
				nil,
				"Damaged quantity must be zero or greater.",
			))
		}
		if item.ReceivedQuantity.Add(item.DamagedQuantity).GreaterThan(item.Quantity) {
			result.Issues = append(result.Issues, newIssue(
				"INVALID_QUANTITY",
				field,
				item.ReceivedQuantity.Add(item.DamagedQuantity),
				nil,
				item.Quantity,
				"Received plus damaged quantity cannot exceed the note quantity.",
			))
		}
	}
	result.Valid = !hasErrors(result.Issues)

	if !result.Valid {
		if hasIssue(result.Issues, "DELIVERY_ALREADY_RECORDED") {
			return CreateResult{}, ErrDuplicateDelivery
		}
		return CreateResult{}, &ValidationError{Result: result}
	}
	if order == nil {
		return CreateResult{}, validationFailure(result, newIssue(
			"ORDER_NOT_FOUND",
			"poNumber",
			nil,
			nil,
			nil,
			"Purchase order was not found.",
		))
	}

	orderItems := make(map[string]store.PurchaseOrderItem, len(order.Items))
	for _, item := range order.Items {
		orderItems[item.ID] = item
	}

	storeItems := make([]store.CreateDeliveryItem, 0, len(in.Items))
	for _, item := range in.Items {
		orderItem, ok := orderItems[normalizeUUID(item.POItemID)]
		if !ok {
			return CreateResult{}, validationFailure(result, newIssue(
				"UNKNOWN_ITEM",
				"items",
				item.POItemID,
				nil,
				nil,
				"Delivery item does not belong to the purchase order.",
			))
		}
		storeItems = append(storeItems, store.CreateDeliveryItem{
			PurchaseOrderItemID: orderItem.ID,
			Description:         orderItem.Description,
			NoteQuantity:        item.Quantity,
			ReceivedQuantity:    item.ReceivedQuantity,
			DamagedQuantity:     item.DamagedQuantity,
			Remarks:             trimmedPointer(item.Remarks),
		})
	}

	deliveryDate, dateErr := parseDate(in.DeliveryDate)
	if dateErr != nil {
		return CreateResult{}, validationFailure(result, newIssue(
			"INVALID_DATE",
			"deliveryDate",
			strings.TrimSpace(in.DeliveryDate),
			nil,
			nil,
			"Delivery date must use YYYY-MM-DD.",
		))
	}

	created, err := s.store.CreateDelivery(ctx, store.CreateDeliveryInput{
		ClientRequestID:    clientRequestID,
		PurchaseOrderID:    order.ID,
		PONumber:           order.PONumber,
		DeliveryNoteNumber: normalizeIdentifier(in.DeliveryNoteNumber),
		SupplierName:       order.SupplierName,
		SiteName:           order.SiteName,
		DeliveryDate:       deliveryDate,
		WorkerName:         strings.TrimSpace(in.WorkerName),
		WorkerIdentifier:   strings.TrimSpace(in.WorkerIdentifier),
		VoiceTranscript:    trimmedPointer(in.VoiceTranscript),
		RawOCRText:         trimmedPointer(in.RawOCRText),
		Items:              storeItems,
	})
	if err != nil {
		return CreateResult{}, mapStoreError(err, result)
	}
	if created == nil || created.Delivery == nil {
		return CreateResult{}, errors.New("store returned an empty delivery")
	}

	return CreateResult{
		ID:               created.Delivery.ID,
		IdempotentReplay: created.IdempotentReplay,
		OrderStatus:      created.Delivery.OrderStatus,
		RecordedAt:       created.Delivery.CreatedAt,
	}, nil
}

func mapStoreError(err error, result ValidationResult) error {
	switch {
	case errors.Is(err, store.ErrDuplicateDelivery):
		return ErrDuplicateDelivery
	case errors.Is(err, store.ErrOrderNotOpen):
		return validationFailure(result, newIssue(
			"ORDER_NOT_OPEN",
			"poNumber",
			nil,
			nil,
			nil,
			"Purchase order is not open for receiving.",
		))
	case errors.Is(err, store.ErrNotFound):
		return validationFailure(result, newIssue(
			"ORDER_NOT_FOUND",
			"poNumber",
			nil,
			nil,
			nil,
			"Purchase order was not found.",
		))
	case errors.Is(err, store.ErrPurchaseOrderItemNotFound):
		return validationFailure(result, newIssue(
			"UNKNOWN_ITEM",
			"items",
			nil,
			nil,
			nil,
			"Delivery item does not belong to the purchase order.",
		))
	case errors.Is(err, store.ErrDuplicateItem):
		return validationFailure(result, newIssue(
			"DUPLICATE_ITEM",
			"items",
			nil,
			nil,
			nil,
			"Two delivery lines map to the same purchase order line.",
		))
	case errors.Is(err, store.ErrInvalidQuantity):
		return validationFailure(result, newIssue(
			"INVALID_QUANTITY",
			"items",
			nil,
			nil,
			nil,
			"Delivery quantities are invalid.",
		))
	case errors.Is(err, store.ErrQuantityConflict):
		var conflict *store.QuantityConflictError
		if errors.As(err, &conflict) {
			return validationFailure(result, newIssue(
				"OVER_RECEIPT",
				"items",
				nil,
				nil,
				conflict.Remaining,
				"Received quantity exceeds the remaining quantity on the purchase order.",
			))
		}
		return validationFailure(result, newIssue(
			"OVER_RECEIPT",
			"items",
			nil,
			nil,
			nil,
			"Received quantity exceeds the remaining quantity on the purchase order.",
		))
	default:
		return err
	}
}

func validationFailure(result ValidationResult, issue Issue) error {
	result.Issues = append(result.Issues, issue)
	result.Valid = false
	return &ValidationError{Result: result}
}

func buildOrderView(order *store.PurchaseOrder) *OrderView {
	view := &OrderView{
		PONumber: order.PONumber,
		Supplier: order.SupplierName,
		Site:     order.SiteName,
		Status:   order.Status,
		Items:    make([]OrderItemView, 0, len(order.Items)),
	}
	if order.ExpectedDeliveryDate != nil {
		expected := order.ExpectedDeliveryDate.Format("2006-01-02")
		view.ExpectedDeliveryDate = &expected
	}
	if order.CancelledAt != nil {
		cancelledAt := order.CancelledAt.Format("2006-01-02")
		view.CancelledAt = &cancelledAt
	}
	if order.CancellationReason != nil {
		reason := *order.CancellationReason
		view.CancellationReason = &reason
	}
	for _, item := range order.Items {
		view.Items = append(view.Items, OrderItemView{
			ID:                item.ID,
			LineNumber:        item.LineNumber,
			Description:       item.Description,
			OrderedQuantity:   item.OrderedQuantity,
			ReceivedQuantity:  item.ReceivedQuantity,
			DamagedQuantity:   item.DamagedQuantity,
			RemainingQuantity: item.RemainingQuantity(),
		})
	}
	return view
}

func normalizeIdentifier(value string) string {
	return strings.ToUpper(strings.Join(strings.Fields(value), " "))
}

func normalizeUUID(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeText(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

func parseDate(value string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(value))
}

func trimmedPointer(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func hasErrors(issues []Issue) bool {
	for _, issue := range issues {
		if issue.Severity == "error" {
			return true
		}
	}
	return false
}

func hasIssue(issues []Issue, code string) bool {
	for _, issue := range issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}

func newIssue(code, field string, actual, expected, expectedMax any, message string) Issue {
	return Issue{
		Severity:    "error",
		Code:        code,
		Field:       field,
		Actual:      actual,
		Expected:    expected,
		ExpectedMax: expectedMax,
		Message:     message,
	}
}

func newWarning(code, field string, actual, expected, expectedMax any, message string) Issue {
	issue := newIssue(code, field, actual, expected, expectedMax, message)
	issue.Severity = "warning"
	return issue
}
