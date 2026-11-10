package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"gnani-hackathon/backend/internal/config"
	"gnani-hackathon/backend/internal/service"
)

const testPOItemID = "8f3c8a1e-4b3d-4f6a-9c2e-1a2b3c4d5e6f"

type fakeDeliveryService struct {
	validateResult service.ValidationResult
	validateErr    error
	createResult   service.CreateResult
	createErr      error

	validateCalls int
	createCalls   int
	lastValidate  service.ValidateInput
	lastCreate    service.CreateInput
}

func (f *fakeDeliveryService) Validate(_ context.Context, in service.ValidateInput) (service.ValidationResult, error) {
	f.validateCalls++
	f.lastValidate = in
	return f.validateResult, f.validateErr
}

func (f *fakeDeliveryService) Create(_ context.Context, in service.CreateInput) (service.CreateResult, error) {
	f.createCalls++
	f.lastCreate = in
	return f.createResult, f.createErr
}

func deliveryTestRouter(svc DeliveryService) http.Handler {
	return newRouter(config.Config{Env: "test", CORSOrigins: []string{"*"}}, nil, svc, nil)
}

func performJSONRequest(t *testing.T, router http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeObject(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, rec.Body.String())
	}
	return body
}

func responseError(t *testing.T, body map[string]any) map[string]any {
	t.Helper()
	errorObject, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error object, got %#v", body)
	}
	return errorObject
}

func responseIssues(t *testing.T, body map[string]any) []any {
	t.Helper()
	issues, ok := body["issues"].([]any)
	if !ok {
		t.Fatalf("expected issues array, got %#v", body["issues"])
	}
	return issues
}

func validValidationResult() service.ValidationResult {
	expected := "2026-11-10"
	return service.ValidationResult{
		Valid: true,
		Order: &service.OrderView{
			PONumber:             "PO-1042",
			Supplier:             "Acme Supplies",
			Site:                 "Riverside Tower",
			Status:               "open",
			ExpectedDeliveryDate: &expected,
			Items: []service.OrderItemView{
				{
					ID:                testPOItemID,
					LineNumber:        1,
					Description:       "Cement bags",
					OrderedQuantity:   decimal.RequireFromString("50"),
					ReceivedQuantity:  decimal.RequireFromString("10"),
					DamagedQuantity:   decimal.Zero,
					RemainingQuantity: decimal.RequireFromString("40"),
				},
			},
		},
		DeliveryNote: service.DeliveryNoteView{Number: "DN-1042"},
		Issues:       []service.Issue{},
	}
}

func validValidateBody() string {
	return `{
		"poNumber": "PO-1042",
		"deliveryNoteNumber": "DN-1042",
		"supplier": "Acme Supplies",
		"deliveryDate": "2026-11-06",
		"site": "Riverside Tower",
		"items": [
			{"description": "Cement bags", "quantity": 40}
		]
	}`
}

func validCreateBody() string {
	return `{
		"clientRequestId": "client-request-123",
		"poNumber": "PO-1042",
		"deliveryNoteNumber": "DN-1042",
		"supplier": "Acme Supplies",
		"deliveryDate": "2026-11-06",
		"site": "Riverside Tower",
		"worker": {
			"name": "Pranjal",
			"identifier": "pranjal@example.com"
		},
		"voiceTranscript": "48 received, 2 damaged",
		"items": [
			{
				"poItemId": "8f3c8a1e-4b3d-4f6a-9c2e-1a2b3c4d5e6f",
				"description": "Cement bags",
				"quantity": 50,
				"receivedQuantity": 48,
				"damagedQuantity": 2,
				"remarks": "two torn bags"
			}
		]
	}`
}

func TestValidateEndpointReturnsBusinessResult(t *testing.T) {
	fake := &fakeDeliveryService{validateResult: validValidationResult()}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", validValidateBody())

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}
	body := decodeObject(t, rec)
	if body["valid"] != true {
		t.Fatalf("expected valid=true, got %#v", body["valid"])
	}
	if body["order"] == nil {
		t.Fatal("expected order object")
	}
	if !strings.Contains(rec.Body.String(), `"issues":[]`) {
		t.Fatalf("expected empty issues array, body=%s", rec.Body.String())
	}
	if fake.validateCalls != 1 {
		t.Fatalf("expected one validate call, got %d", fake.validateCalls)
	}
	if fake.lastValidate.PONumber != "PO-1042" || fake.lastValidate.DeliveryNoteNumber != "DN-1042" {
		t.Fatalf("unexpected validate input: %#v", fake.lastValidate)
	}
	if !fake.lastValidate.Items[0].Quantity.Equal(decimal.RequireFromString("40")) {
		t.Fatalf("unexpected quantity: %s", fake.lastValidate.Items[0].Quantity)
	}
}

func TestValidateEndpointPassesReceivedQuantity(t *testing.T) {
	fake := &fakeDeliveryService{validateResult: validValidationResult()}
	body := strings.Replace(
		validValidateBody(),
		`"quantity": 40`,
		`"quantity": 42, "receivedQuantity": 38`,
		1,
	)
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", body)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}
	if fake.lastValidate.Items[0].ReceivedQuantity == nil {
		t.Fatal("expected received quantity to be passed to the service")
	}
	if !fake.lastValidate.Items[0].ReceivedQuantity.Equal(decimal.RequireFromString("38")) {
		t.Fatalf("unexpected received quantity: %s", fake.lastValidate.Items[0].ReceivedQuantity)
	}
}

func TestValidateEndpointReturnsValidationIssues(t *testing.T) {
	result := validValidationResult()
	result.Valid = false
	result.Issues = []service.Issue{
		{
			Severity: "error",
			Code:     "SUPPLIER_MISMATCH",
			Field:    "supplier",
			Actual:   "Acme Supply Co",
			Expected: "Acme Supplies",
			Message:  "Supplier does not match the purchase order.",
		},
	}
	fake := &fakeDeliveryService{validateResult: result}

	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", validValidateBody())
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}
	body := decodeObject(t, rec)
	if body["valid"] != false {
		t.Fatalf("expected valid=false, got %#v", body["valid"])
	}
	issues := responseIssues(t, body)
	if len(issues) != 1 {
		t.Fatalf("expected one issue, got %d", len(issues))
	}
	issue := issues[0].(map[string]any)
	if issue["code"] != "SUPPLIER_MISMATCH" {
		t.Fatalf("unexpected issue: %#v", issue)
	}
	if issue["actual"] != "Acme Supply Co" || issue["expected"] != "Acme Supplies" {
		t.Fatalf("unexpected actual/expected: %#v", issue)
	}
}

func TestValidateEndpointMalformedJSON(t *testing.T) {
	fake := &fakeDeliveryService{}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", `{"`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	if errorObject["code"] != "INVALID_REQUEST" {
		t.Fatalf("unexpected error code: %#v", errorObject["code"])
	}
	if fake.validateCalls != 0 {
		t.Fatalf("expected no service call, got %d", fake.validateCalls)
	}
}

func TestValidateEndpointMissingFields(t *testing.T) {
	fake := &fakeDeliveryService{}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", `{}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields, ok := errorObject["fields"].(map[string]any)
	if !ok {
		t.Fatalf("expected fields, got %#v", errorObject)
	}
	for _, key := range []string{"poNumber", "deliveryNoteNumber", "supplier", "deliveryDate", "site", "items"} {
		if _, exists := fields[key]; !exists {
			t.Fatalf("expected field error for %s, got %#v", key, fields)
		}
	}
	if fake.validateCalls != 0 {
		t.Fatalf("expected no service call, got %d", fake.validateCalls)
	}
}

func TestValidateEndpointMissingDateIsRequestError(t *testing.T) {
	fake := &fakeDeliveryService{}
	body := strings.Replace(validValidateBody(), `"deliveryDate": "2026-11-06",`, "", 1)
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields := errorObject["fields"].(map[string]any)
	if fields["deliveryDate"] != "required" {
		t.Fatalf("expected deliveryDate required, got %#v", fields)
	}
}

func TestValidateEndpointMalformedDateIsBusinessIssue(t *testing.T) {
	result := validValidationResult()
	result.Valid = false
	result.Issues = []service.Issue{
		{
			Severity: "error",
			Code:     "INVALID_DATE",
			Field:    "deliveryDate",
			Actual:   "06/11/2026",
			Message:  "Delivery date must use YYYY-MM-DD.",
		},
	}
	fake := &fakeDeliveryService{validateResult: result}
	body := strings.Replace(validValidateBody(), `"deliveryDate": "2026-11-06"`, `"deliveryDate": "06/11/2026"`, 1)

	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}
	response := decodeObject(t, rec)
	if response["valid"] != false {
		t.Fatalf("expected valid=false, got %#v", response["valid"])
	}
	issues := responseIssues(t, response)
	if issues[0].(map[string]any)["code"] != "INVALID_DATE" {
		t.Fatalf("unexpected issues: %#v", issues)
	}
}

func TestValidateEndpointRejectsQuantityScale(t *testing.T) {
	fake := &fakeDeliveryService{}
	body := strings.Replace(validValidateBody(), `"quantity": 40`, `"quantity": 40.0001`, 1)
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields := errorObject["fields"].(map[string]any)
	if fields["items[0].quantity"] != "must have at most 3 decimal places" {
		t.Fatalf("unexpected fields: %#v", fields)
	}
	if fake.validateCalls != 0 {
		t.Fatalf("expected no service call, got %d", fake.validateCalls)
	}
}

func TestValidateEndpointRejectsInvalidPOItemID(t *testing.T) {
	fake := &fakeDeliveryService{}
	body := strings.Replace(
		validValidateBody(),
		`{"description": "Cement bags", "quantity": 40}`,
		`{"poItemId": "not-a-uuid", "description": "Cement bags", "quantity": 40}`,
		1,
	)
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/orders/validate", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields := errorObject["fields"].(map[string]any)
	if fields["items[0].poItemId"] != "must be a UUID" {
		t.Fatalf("unexpected fields: %#v", fields)
	}
}

func TestCreateEndpointCreated(t *testing.T) {
	recordedAt := time.Date(2026, 11, 6, 10, 15, 0, 0, time.UTC)
	fake := &fakeDeliveryService{
		createResult: service.CreateResult{
			ID:          "delivery-1",
			OrderStatus: "partially_received",
			RecordedAt:  recordedAt,
		},
	}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", validCreateBody())

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d; body=%s", rec.Code, rec.Body.String())
	}
	body := decodeObject(t, rec)
	if body["id"] != "delivery-1" || body["idempotentReplay"] != false {
		t.Fatalf("unexpected body: %#v", body)
	}
	if body["orderStatus"] != "partially_received" {
		t.Fatalf("unexpected order status: %#v", body["orderStatus"])
	}
	if body["recordedAt"] != "2026-11-06T10:15:00Z" {
		t.Fatalf("unexpected recordedAt: %#v", body["recordedAt"])
	}
	if fake.createCalls != 1 {
		t.Fatalf("expected one create call, got %d", fake.createCalls)
	}
	if fake.lastCreate.ClientRequestID == nil || *fake.lastCreate.ClientRequestID != "client-request-123" {
		t.Fatalf("unexpected client request id: %#v", fake.lastCreate.ClientRequestID)
	}
	if fake.lastCreate.WorkerName != "Pranjal" || fake.lastCreate.WorkerIdentifier != "pranjal@example.com" {
		t.Fatalf("unexpected worker: %#v", fake.lastCreate)
	}
	if fake.lastCreate.Items[0].POItemID != testPOItemID {
		t.Fatalf("unexpected PO item id: %q", fake.lastCreate.Items[0].POItemID)
	}
	if !fake.lastCreate.Items[0].Quantity.Equal(decimal.RequireFromString("50")) ||
		!fake.lastCreate.Items[0].ReceivedQuantity.Equal(decimal.RequireFromString("48")) ||
		!fake.lastCreate.Items[0].DamagedQuantity.Equal(decimal.RequireFromString("2")) {
		t.Fatalf("unexpected quantities: %#v", fake.lastCreate.Items[0])
	}
}

func TestCreateEndpointIdempotentReplay(t *testing.T) {
	fake := &fakeDeliveryService{
		createResult: service.CreateResult{
			ID:               "delivery-existing",
			IdempotentReplay: true,
			OrderStatus:      "partially_received",
			RecordedAt:       time.Date(2026, 11, 6, 10, 15, 0, 0, time.UTC),
		},
	}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", validCreateBody())

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", rec.Code, rec.Body.String())
	}
	body := decodeObject(t, rec)
	if body["idempotentReplay"] != true || body["id"] != "delivery-existing" {
		t.Fatalf("unexpected body: %#v", body)
	}
}

func TestCreateEndpointDuplicateConflict(t *testing.T) {
	fake := &fakeDeliveryService{createErr: service.ErrDuplicateDelivery}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", validCreateBody())

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	if errorObject["code"] != "DELIVERY_ALREADY_RECORDED" {
		t.Fatalf("unexpected error: %#v", errorObject)
	}
}

func TestCreateEndpointValidationFailure(t *testing.T) {
	fake := &fakeDeliveryService{
		createErr: &service.ValidationError{
			Result: service.ValidationResult{
				Valid: false,
				Issues: []service.Issue{
					{
						Severity: "error",
						Code:     "SUPPLIER_MISMATCH",
						Field:    "supplier",
						Actual:   "Acme Supply Co",
						Expected: "Acme Supplies",
						Message:  "Supplier does not match the purchase order.",
					},
				},
			},
		},
	}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", validCreateBody())

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	if errorObject["code"] != "VALIDATION_FAILED" {
		t.Fatalf("unexpected error: %#v", errorObject)
	}
	issues, ok := errorObject["issues"].([]any)
	if !ok || len(issues) != 1 {
		t.Fatalf("expected one issue, got %#v", errorObject["issues"])
	}
}

func TestCreateEndpointInternalError(t *testing.T) {
	fake := &fakeDeliveryService{createErr: errors.New("boom")}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", validCreateBody())

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	if errorObject["code"] != "INTERNAL_ERROR" {
		t.Fatalf("unexpected error: %#v", errorObject)
	}
}

func TestCreateEndpointMissingRequiredFields(t *testing.T) {
	fake := &fakeDeliveryService{}
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", `{}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields := errorObject["fields"].(map[string]any)
	for _, key := range []string{
		"poNumber",
		"deliveryNoteNumber",
		"supplier",
		"deliveryDate",
		"site",
		"worker.name",
		"worker.identifier",
		"items",
	} {
		if _, exists := fields[key]; !exists {
			t.Fatalf("expected field error for %s, got %#v", key, fields)
		}
	}
	if fake.createCalls != 0 {
		t.Fatalf("expected no service call, got %d", fake.createCalls)
	}
}

func TestCreateEndpointMissingPOItemID(t *testing.T) {
	fake := &fakeDeliveryService{}
	body := strings.Replace(validCreateBody(), `"poItemId": "8f3c8a1e-4b3d-4f6a-9c2e-1a2b3c4d5e6f",`, "", 1)
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields := errorObject["fields"].(map[string]any)
	if fields["items[0].poItemId"] != "required" {
		t.Fatalf("unexpected fields: %#v", fields)
	}
}

func TestCreateEndpointInvalidClientRequestID(t *testing.T) {
	fake := &fakeDeliveryService{}
	body := strings.Replace(validCreateBody(), `"client-request-123"`, `"short"`, 1)
	rec := performJSONRequest(t, deliveryTestRouter(fake), http.MethodPost, "/api/v1/deliveries", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", rec.Code, rec.Body.String())
	}
	errorObject := responseError(t, decodeObject(t, rec))
	fields := errorObject["fields"].(map[string]any)
	if fields["clientRequestId"] != "must be between 8 and 128 characters" {
		t.Fatalf("unexpected fields: %#v", fields)
	}
}
