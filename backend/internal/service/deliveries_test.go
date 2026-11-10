package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"gnani-hackathon/backend/internal/store"
)

type fakeStore struct {
	order               *store.PurchaseOrder
	orderErr            error
	orders              []store.PurchaseOrder
	ordersErr           error
	deliveryExists      bool
	deliveryExistsErr   error
	existingDelivery    *store.Delivery
	existingDeliveryErr error
	createResult        *store.CreateDeliveryResult
	createErr           error

	getOrderCalls       int
	listOrdersCalls     int
	lastPONumber        string
	lastClientRequestID string
	createCalls         int
	createInput         store.CreateDeliveryInput
}

func (f *fakeStore) GetPurchaseOrder(_ context.Context, poNumber string) (*store.PurchaseOrder, error) {
	f.getOrderCalls++
	f.lastPONumber = poNumber
	if f.orderErr != nil {
		return nil, f.orderErr
	}
	if f.order == nil {
		return nil, store.ErrNotFound
	}
	return f.order, nil
}

func (f *fakeStore) ListPurchaseOrders(_ context.Context) ([]store.PurchaseOrder, error) {
	f.listOrdersCalls++
	if f.ordersErr != nil {
		return nil, f.ordersErr
	}
	return f.orders, nil
}

func (f *fakeStore) DeliveryExists(_ context.Context, _, _ string) (bool, error) {
	return f.deliveryExists, f.deliveryExistsErr
}

func (f *fakeStore) GetDeliveryByClientRequestID(_ context.Context, clientRequestID string) (*store.Delivery, error) {
	f.lastClientRequestID = clientRequestID
	if f.existingDeliveryErr != nil {
		return nil, f.existingDeliveryErr
	}
	if f.existingDelivery == nil {
		return nil, store.ErrNotFound
	}
	return f.existingDelivery, nil
}

func (f *fakeStore) CreateDelivery(_ context.Context, in store.CreateDeliveryInput) (*store.CreateDeliveryResult, error) {
	f.createCalls++
	f.createInput = in
	if f.createErr != nil {
		return nil, f.createErr
	}
	if f.createResult != nil {
		return f.createResult, nil
	}
	return &store.CreateDeliveryResult{
		Delivery: &store.Delivery{
			ID:          "delivery-default",
			OrderStatus: "partially_received",
			CreatedAt:   time.Date(2026, 11, 6, 10, 15, 0, 0, time.UTC),
		},
	}, nil
}

func testOrder() *store.PurchaseOrder {
	expected := time.Date(2026, 11, 6, 0, 0, 0, 0, time.UTC)
	return &store.PurchaseOrder{
		ID:                   "po-1",
		PONumber:             "PO-1042",
		SupplierName:         "Acme Supplies",
		SiteName:             "Riverside Tower",
		Status:               "open",
		ExpectedDeliveryDate: &expected,
		Items: []store.PurchaseOrderItem{
			{
				ID:               "item-1",
				LineNumber:       1,
				Description:      "Cement bags",
				OrderedQuantity:  decimal.RequireFromString("50"),
				ReceivedQuantity: decimal.RequireFromString("10"),
			},
			{
				ID:              "item-2",
				LineNumber:      2,
				Description:     "Steel rebar",
				OrderedQuantity: decimal.RequireFromString("20"),
			},
		},
	}
}

func TestListOrdersMapsPurchaseOrders(t *testing.T) {
	expected := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)
	cancelledAt := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)
	reason := "Duplicate order"
	fake := &fakeStore{
		orders: []store.PurchaseOrder{
			{
				PONumber:             "PO-1024",
				SupplierName:         "TilePro Depot",
				SiteName:             "Zone B",
				Status:               "cancelled",
				ExpectedDeliveryDate: &expected,
				CancelledAt:          &cancelledAt,
				CancellationReason:   &reason,
				Items: []store.PurchaseOrderItem{
					{
						ID:              "item-1",
						LineNumber:      1,
						Description:     "Ceramic tiles",
						OrderedQuantity: decimal.RequireFromString("120"),
					},
				},
			},
		},
	}

	views, err := New(fake).ListOrders(context.Background())
	if err != nil {
		t.Fatalf("ListOrders returned error: %v", err)
	}
	if len(views) != 1 {
		t.Fatalf("expected 1 order, got %d", len(views))
	}
	if views[0].PONumber != "PO-1024" || views[0].Status != "cancelled" {
		t.Fatalf("unexpected order view: %+v", views[0])
	}
	if views[0].CancelledAt == nil || *views[0].CancelledAt != "2026-10-27" {
		t.Fatalf("expected cancellation date, got %+v", views[0].CancelledAt)
	}
	if views[0].CancellationReason == nil || *views[0].CancellationReason != "Duplicate order" {
		t.Fatalf("expected cancellation reason, got %+v", views[0].CancellationReason)
	}
	if len(views[0].Items) != 1 || views[0].Items[0].RemainingQuantity.String() != "120" {
		t.Fatalf("unexpected items: %+v", views[0].Items)
	}
}

func TestListOrdersReturnsEmptySlice(t *testing.T) {
	views, err := New(&fakeStore{}).ListOrders(context.Background())
	if err != nil {
		t.Fatalf("ListOrders returned error: %v", err)
	}
	if views == nil {
		t.Fatal("expected a non-nil empty slice")
	}
	if len(views) != 0 {
		t.Fatalf("expected no orders, got %d", len(views))
	}
}

func validValidateInput() ValidateInput {
	return ValidateInput{
		PONumber:           "po-1042",
		DeliveryNoteNumber: "dn-1042",
		Supplier:           "Acme Supplies",
		DeliveryDate:       "2026-11-06",
		Site:               "Riverside Tower",
		Items: []ValidateItem{
			{
				POItemID:    stringPtr("ITEM-1"),
				Description: "Cement bags",
				Quantity:    decimal.RequireFromString("40"),
			},
			{
				Description: "Steel rebar",
				Quantity:    decimal.RequireFromString("20"),
			},
		},
	}
}

func validCreateInput() CreateInput {
	return CreateInput{
		ClientRequestID:    stringPtr("client-request-1"),
		PONumber:           "po-1042",
		DeliveryNoteNumber: "dn-1042",
		Supplier:           "Acme Supplies",
		DeliveryDate:       "2026-11-06",
		Site:               "Riverside Tower",
		WorkerName:         "Pranjal",
		WorkerIdentifier:   "pranjal@example.com",
		Items: []CreateItem{
			{
				POItemID:         "ITEM-1",
				Description:      "Cement bags",
				Quantity:         decimal.RequireFromString("40"),
				ReceivedQuantity: decimal.RequireFromString("38"),
				DamagedQuantity:  decimal.RequireFromString("2"),
				Remarks:          stringPtr("two torn bags"),
			},
			{
				POItemID:         "item-2",
				Description:      "Steel rebar",
				Quantity:         decimal.RequireFromString("20"),
				ReceivedQuantity: decimal.RequireFromString("20"),
				DamagedQuantity:  decimal.RequireFromString("0"),
			},
		},
	}
}

func stringPtr(value string) *string {
	return &value
}

func findIssue(t *testing.T, result ValidationResult, code string) Issue {
	t.Helper()
	for _, issue := range result.Issues {
		if issue.Code == code {
			return issue
		}
	}
	t.Fatalf("expected issue %s, got %+v", code, result.Issues)
	return Issue{}
}

func TestValidateValidNote(t *testing.T) {
	fake := &fakeStore{order: testOrder()}
	svc := New(fake)

	result, err := svc.Validate(context.Background(), validValidateInput())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if !result.Valid {
		t.Fatalf("expected valid result, got issues %+v", result.Issues)
	}
	if len(result.Issues) != 0 {
		t.Fatalf("expected no issues, got %+v", result.Issues)
	}
	if result.Order == nil || result.Order.PONumber != "PO-1042" {
		t.Fatalf("unexpected order: %+v", result.Order)
	}
	if result.DeliveryNote.Number != "DN-1042" {
		t.Fatalf("expected normalized note number DN-1042, got %q", result.DeliveryNote.Number)
	}
	if result.DeliveryNote.AlreadyRecorded {
		t.Fatal("expected note not to be marked as already recorded")
	}
	if fake.lastPONumber != "PO-1042" {
		t.Fatalf("expected normalized PO lookup, got %q", fake.lastPONumber)
	}
	if got := result.Order.Items[0].RemainingQuantity; !got.Equal(decimal.RequireFromString("40")) {
		t.Fatalf("expected remaining quantity 40, got %s", got)
	}
}

func TestValidateOrderNotFound(t *testing.T) {
	fake := &fakeStore{orderErr: store.ErrNotFound}
	svc := New(fake)

	result, err := svc.Validate(context.Background(), validValidateInput())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	if result.Order != nil {
		t.Fatalf("expected nil order, got %+v", result.Order)
	}
	findIssue(t, result, "ORDER_NOT_FOUND")
}

func TestValidateCancelledOrder(t *testing.T) {
	order := testOrder()
	order.Status = "cancelled"
	svc := New(&fakeStore{order: order})

	result, err := svc.Validate(context.Background(), validValidateInput())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "ORDER_CANCELLED")
}

func TestValidateClosedOrder(t *testing.T) {
	order := testOrder()
	order.Status = "closed"
	svc := New(&fakeStore{order: order})

	result, err := svc.Validate(context.Background(), validValidateInput())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "ORDER_NOT_OPEN")
}

func TestValidateDuplicateDeliveryNote(t *testing.T) {
	svc := New(&fakeStore{order: testOrder(), deliveryExists: true})

	result, err := svc.Validate(context.Background(), validValidateInput())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	if !result.DeliveryNote.AlreadyRecorded {
		t.Fatal("expected alreadyRecorded to be true")
	}
	findIssue(t, result, "DELIVERY_ALREADY_RECORDED")
}

func TestValidateSupplierMismatch(t *testing.T) {
	input := validValidateInput()
	input.Supplier = "Acme Supply Co"
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	issue := findIssue(t, result, "SUPPLIER_MISMATCH")
	if issue.Actual != "Acme Supply Co" {
		t.Fatalf("unexpected actual: %#v", issue.Actual)
	}
	if issue.Expected != "Acme Supplies" {
		t.Fatalf("unexpected expected: %#v", issue.Expected)
	}
}

func TestValidateSiteMismatch(t *testing.T) {
	input := validValidateInput()
	input.Site = "North Warehouse"
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "SITE_MISMATCH")
}

func TestValidateUnknownItem(t *testing.T) {
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			Description: "Ceramic tiles",
			Quantity:    decimal.RequireFromString("5"),
		},
	}
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "UNKNOWN_ITEM")
}

func TestValidateAmbiguousItem(t *testing.T) {
	order := testOrder()
	order.Items = append(order.Items, store.PurchaseOrderItem{
		ID:              "item-3",
		LineNumber:      3,
		Description:     "Cement bags",
		OrderedQuantity: decimal.RequireFromString("5"),
	})
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			Description: "Cement bags",
			Quantity:    decimal.RequireFromString("1"),
		},
	}
	svc := New(&fakeStore{order: order})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "AMBIGUOUS_ITEM")
}

func TestValidateDuplicateItem(t *testing.T) {
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			POItemID:    stringPtr("item-1"),
			Description: "Cement bags",
			Quantity:    decimal.RequireFromString("10"),
		},
		{
			POItemID:    stringPtr("item-1"),
			Description: "Cement bags",
			Quantity:    decimal.RequireFromString("10"),
		},
	}
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "DUPLICATE_ITEM")
}

func TestValidateOverReceipt(t *testing.T) {
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			POItemID:    stringPtr("item-1"),
			Description: "Cement bags",
			Quantity:    decimal.RequireFromString("41"),
		},
	}
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	issue := findIssue(t, result, "OVER_RECEIPT")
	if !issue.ExpectedMax.(decimal.Decimal).Equal(decimal.RequireFromString("40")) {
		t.Fatalf("unexpected expectedMax: %#v", issue.ExpectedMax)
	}
}

func TestValidateOverReceiptUsesReceivedQuantity(t *testing.T) {
	received := decimal.RequireFromString("40")
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			POItemID:         stringPtr("item-1"),
			Description:      "Cement bags",
			Quantity:         decimal.RequireFromString("42"),
			ReceivedQuantity: &received,
		},
	}
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if !result.Valid {
		t.Fatalf("expected valid result, got issues: %+v", result.Issues)
	}
}

func TestValidateOverReceiptRejectsGoodQuantity(t *testing.T) {
	received := decimal.RequireFromString("41")
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			POItemID:         stringPtr("item-1"),
			Description:      "Cement bags",
			Quantity:         decimal.RequireFromString("42"),
			ReceivedQuantity: &received,
		},
	}
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	issue := findIssue(t, result, "OVER_RECEIPT")
	if issue.Field != "items[0].receivedQuantity" {
		t.Fatalf("unexpected field: %q", issue.Field)
	}
	if !issue.Actual.(decimal.Decimal).Equal(received) {
		t.Fatalf("unexpected actual: %#v", issue.Actual)
	}
	if !issue.ExpectedMax.(decimal.Decimal).Equal(decimal.RequireFromString("40")) {
		t.Fatalf("unexpected expectedMax: %#v", issue.ExpectedMax)
	}
}

func TestValidatePartialDelivery(t *testing.T) {
	input := validValidateInput()
	input.Items = []ValidateItem{
		{
			POItemID:    stringPtr("item-1"),
			Description: "Cement bags",
			Quantity:    decimal.RequireFromString("10"),
		},
	}
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if !result.Valid {
		t.Fatalf("expected valid result, got issues %+v", result.Issues)
	}
}

func TestValidateDateVarianceIsWarning(t *testing.T) {
	order := testOrder()
	expected := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	order.ExpectedDeliveryDate = &expected
	svc := New(&fakeStore{order: order})

	result, err := svc.Validate(context.Background(), validValidateInput())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if !result.Valid {
		t.Fatalf("expected date variance to be non-blocking, got issues %+v", result.Issues)
	}
	issue := findIssue(t, result, "DELIVERY_DATE_VARIANCE")
	if issue.Severity != "warning" {
		t.Fatalf("expected warning severity, got %q", issue.Severity)
	}
}

func TestValidateInvalidDate(t *testing.T) {
	input := validValidateInput()
	input.DeliveryDate = "06/11/2026"
	svc := New(&fakeStore{order: testOrder()})

	result, err := svc.Validate(context.Background(), input)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result")
	}
	findIssue(t, result, "INVALID_DATE")
}

func TestCreateHappyPath(t *testing.T) {
	createdAt := time.Date(2026, 11, 6, 10, 15, 0, 0, time.UTC)
	fake := &fakeStore{
		order: testOrder(),
		createResult: &store.CreateDeliveryResult{
			Delivery: &store.Delivery{
				ID:          "delivery-1",
				OrderStatus: "partially_received",
				CreatedAt:   createdAt,
			},
		},
	}
	svc := New(fake)

	result, err := svc.Create(context.Background(), validCreateInput())
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if result.ID != "delivery-1" || result.IdempotentReplay {
		t.Fatalf("unexpected create result: %+v", result)
	}
	if result.OrderStatus != "partially_received" {
		t.Fatalf("unexpected order status: %q", result.OrderStatus)
	}
	if !result.RecordedAt.Equal(createdAt) {
		t.Fatalf("unexpected recorded at: %s", result.RecordedAt)
	}
	if fake.createCalls != 1 {
		t.Fatalf("expected one create call, got %d", fake.createCalls)
	}
	if fake.createInput.PurchaseOrderID != "po-1" {
		t.Fatalf("unexpected purchase order id: %q", fake.createInput.PurchaseOrderID)
	}
	if fake.createInput.PONumber != "PO-1042" {
		t.Fatalf("expected canonical PO number, got %q", fake.createInput.PONumber)
	}
	if fake.createInput.DeliveryNoteNumber != "DN-1042" {
		t.Fatalf("expected normalized note number, got %q", fake.createInput.DeliveryNoteNumber)
	}
	if fake.createInput.SupplierName != "Acme Supplies" || fake.createInput.SiteName != "Riverside Tower" {
		t.Fatalf("expected canonical supplier/site, got %#v", fake.createInput)
	}
	if len(fake.createInput.Items) != 2 {
		t.Fatalf("expected two delivery items, got %d", len(fake.createInput.Items))
	}
	first := fake.createInput.Items[0]
	if first.PurchaseOrderItemID != "item-1" {
		t.Fatalf("expected normalized item id, got %q", first.PurchaseOrderItemID)
	}
	if first.Description != "Cement bags" {
		t.Fatalf("expected canonical description, got %q", first.Description)
	}
	if !first.NoteQuantity.Equal(decimal.RequireFromString("40")) ||
		!first.ReceivedQuantity.Equal(decimal.RequireFromString("38")) ||
		!first.DamagedQuantity.Equal(decimal.RequireFromString("2")) {
		t.Fatalf("unexpected quantities: %#v", first)
	}
	if first.Remarks == nil || *first.Remarks != "two torn bags" {
		t.Fatalf("unexpected remarks: %#v", first.Remarks)
	}
}

func TestCreateIdempotentReplay(t *testing.T) {
	recordedAt := time.Date(2026, 11, 6, 10, 15, 0, 0, time.UTC)
	fake := &fakeStore{
		existingDelivery: &store.Delivery{
			ID:          "delivery-existing",
			OrderStatus: "partially_received",
			CreatedAt:   recordedAt,
		},
	}
	svc := New(fake)

	result, err := svc.Create(context.Background(), validCreateInput())
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if !result.IdempotentReplay || result.ID != "delivery-existing" {
		t.Fatalf("unexpected replay result: %+v", result)
	}
	if fake.createCalls != 0 {
		t.Fatalf("expected no create call, got %d", fake.createCalls)
	}
	if fake.lastClientRequestID != "client-request-1" {
		t.Fatalf("unexpected client request id: %q", fake.lastClientRequestID)
	}
}

func TestCreateDuplicateDeliveryReturnsConflict(t *testing.T) {
	fake := &fakeStore{order: testOrder(), deliveryExists: true}
	svc := New(fake)

	_, err := svc.Create(context.Background(), validCreateInput())
	if !errors.Is(err, ErrDuplicateDelivery) {
		t.Fatalf("expected ErrDuplicateDelivery, got %v", err)
	}
	if fake.createCalls != 0 {
		t.Fatalf("expected no create call, got %d", fake.createCalls)
	}
}

func TestCreateStrictMismatchReturnsValidationError(t *testing.T) {
	input := validCreateInput()
	input.Supplier = "Acme Supply Co"
	fake := &fakeStore{order: testOrder()}
	svc := New(fake)

	_, err := svc.Create(context.Background(), input)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	if validationErr.Result.Valid {
		t.Fatal("expected invalid validation result")
	}
	findIssue(t, validationErr.Result, "SUPPLIER_MISMATCH")
	if fake.createCalls != 0 {
		t.Fatalf("expected no create call, got %d", fake.createCalls)
	}
}

func TestCreateInvalidQuantityReturnsValidationError(t *testing.T) {
	input := validCreateInput()
	input.Items[0].DamagedQuantity = decimal.RequireFromString("3")
	fake := &fakeStore{order: testOrder()}
	svc := New(fake)

	_, err := svc.Create(context.Background(), input)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	findIssue(t, validationErr.Result, "INVALID_QUANTITY")
	if fake.createCalls != 0 {
		t.Fatalf("expected no create call, got %d", fake.createCalls)
	}
}

func TestCreateAllowsDamagedUnitsBeyondRemaining(t *testing.T) {
	order := testOrder()
	order.Items[0].ReceivedQuantity = decimal.RequireFromString("40")
	fake := &fakeStore{order: order}
	svc := New(fake)
	input := validCreateInput()
	input.Items = []CreateItem{
		{
			POItemID:         "item-1",
			Description:      "Cement bags",
			Quantity:         decimal.RequireFromString("12"),
			ReceivedQuantity: decimal.RequireFromString("10"),
			DamagedQuantity:  decimal.RequireFromString("2"),
		},
	}

	_, err := svc.Create(context.Background(), input)
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if fake.createCalls != 1 {
		t.Fatalf("expected one create call, got %d", fake.createCalls)
	}
	if !fake.createInput.Items[0].NoteQuantity.Equal(decimal.RequireFromString("12")) ||
		!fake.createInput.Items[0].ReceivedQuantity.Equal(decimal.RequireFromString("10")) ||
		!fake.createInput.Items[0].DamagedQuantity.Equal(decimal.RequireFromString("2")) {
		t.Fatalf("unexpected quantities: %#v", fake.createInput.Items[0])
	}
}

func TestCreateAllowsDamagedOnlyLineWithNoRemaining(t *testing.T) {
	order := testOrder()
	order.Items[0].ReceivedQuantity = decimal.RequireFromString("50")
	fake := &fakeStore{order: order}
	svc := New(fake)
	input := validCreateInput()
	input.Items = []CreateItem{
		{
			POItemID:         "item-1",
			Description:      "Cement bags",
			Quantity:         decimal.RequireFromString("2"),
			ReceivedQuantity: decimal.Zero,
			DamagedQuantity:  decimal.RequireFromString("2"),
		},
	}

	_, err := svc.Create(context.Background(), input)
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if fake.createCalls != 1 {
		t.Fatalf("expected one create call, got %d", fake.createCalls)
	}
	if !fake.createInput.Items[0].ReceivedQuantity.IsZero() ||
		!fake.createInput.Items[0].DamagedQuantity.Equal(decimal.RequireFromString("2")) {
		t.Fatalf("unexpected quantities: %#v", fake.createInput.Items[0])
	}
}

func TestCreateStoreQuantityConflictReturnsValidationError(t *testing.T) {
	fake := &fakeStore{
		order: testOrder(),
		createErr: &store.QuantityConflictError{
			ItemID:    "item-1",
			Remaining: decimal.RequireFromString("5"),
		},
	}
	svc := New(fake)

	_, err := svc.Create(context.Background(), validCreateInput())
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	issue := findIssue(t, validationErr.Result, "OVER_RECEIPT")
	if !issue.ExpectedMax.(decimal.Decimal).Equal(decimal.RequireFromString("5")) {
		t.Fatalf("unexpected expectedMax: %#v", issue.ExpectedMax)
	}
}

func TestCreateStoreOrderNotOpenReturnsValidationError(t *testing.T) {
	fake := &fakeStore{order: testOrder(), createErr: store.ErrOrderNotOpen}
	svc := New(fake)

	_, err := svc.Create(context.Background(), validCreateInput())
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	findIssue(t, validationErr.Result, "ORDER_NOT_OPEN")
}

func TestCreateStoreDuplicateDeliveryReturnsConflict(t *testing.T) {
	fake := &fakeStore{order: testOrder(), createErr: store.ErrDuplicateDelivery}
	svc := New(fake)

	_, err := svc.Create(context.Background(), validCreateInput())
	if !errors.Is(err, ErrDuplicateDelivery) {
		t.Fatalf("expected ErrDuplicateDelivery, got %v", err)
	}
}

func TestCreateOrderNotFoundReturnsValidationError(t *testing.T) {
	fake := &fakeStore{orderErr: store.ErrNotFound}
	svc := New(fake)

	_, err := svc.Create(context.Background(), validCreateInput())
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	findIssue(t, validationErr.Result, "ORDER_NOT_FOUND")
	if fake.createCalls != 0 {
		t.Fatalf("expected no create call, got %d", fake.createCalls)
	}
}
