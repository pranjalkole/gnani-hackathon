package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shopspring/decimal"

	"gnani-hackathon/backend/internal/config"
	"gnani-hackathon/backend/internal/service"
)

type fakeOrderService struct {
	orders []service.OrderView
	err    error
}

func (f *fakeOrderService) ListOrders(_ context.Context) ([]service.OrderView, error) {
	return f.orders, f.err
}

func orderTestRouter(svc OrderService) http.Handler {
	return newRouter(config.Config{Env: "test", CORSOrigins: []string{"*"}}, nil, nil, svc)
}

func TestListOrdersEndpointReturnsOrders(t *testing.T) {
	expected := "2026-10-28"
	cancelledAt := "2026-10-27"
	reason := "Duplicate order"
	fake := &fakeOrderService{
		orders: []service.OrderView{
			{
				PONumber:             "PO-1024",
				Supplier:             "TilePro Depot",
				Site:                 "Zone B",
				Status:               "cancelled",
				ExpectedDeliveryDate: &expected,
				CancelledAt:          &cancelledAt,
				CancellationReason:   &reason,
				Items: []service.OrderItemView{
					{
						ID:                "item-1",
						LineNumber:        1,
						Description:       "Ceramic tiles",
						OrderedQuantity:   decimal.RequireFromString("120"),
						ReceivedQuantity:  decimal.Zero,
						DamagedQuantity:   decimal.Zero,
						RemainingQuantity: decimal.RequireFromString("120"),
					},
				},
			},
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/orders", nil)
	rec := httptest.NewRecorder()
	orderTestRouter(fake).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}

	body := decodeObject(t, rec)
	orders, ok := body["orders"].([]any)
	if !ok {
		t.Fatalf("expected orders array, got %#v", body["orders"])
	}
	if len(orders) != 1 {
		t.Fatalf("expected 1 order, got %d", len(orders))
	}

	order, ok := orders[0].(map[string]any)
	if !ok {
		t.Fatalf("expected order object, got %#v", orders[0])
	}
	if order["poNumber"] != "PO-1024" || order["status"] != "cancelled" {
		t.Fatalf("unexpected order: %#v", order)
	}
	if order["cancelledAt"] != "2026-10-27" || order["cancellationReason"] != "Duplicate order" {
		t.Fatalf("unexpected cancellation metadata: %#v", order)
	}
}

func TestListOrdersEndpointReturnsEmptyArray(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/orders", nil)
	rec := httptest.NewRecorder()
	orderTestRouter(&fakeOrderService{}).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}

	body := decodeObject(t, rec)
	if _, ok := body["orders"].([]any); !ok {
		t.Fatalf("expected orders array, got %#v", body["orders"])
	}
}

func TestListOrdersEndpointReturnsInternalError(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/orders", nil)
	rec := httptest.NewRecorder()
	orderTestRouter(&fakeOrderService{err: errors.New("db unavailable")}).ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d; body=%s", rec.Code, rec.Body.String())
	}
	body := decodeObject(t, rec)
	if responseError(t, body)["code"] != "INTERNAL_ERROR" {
		t.Fatalf("unexpected error body: %#v", body)
	}
}
