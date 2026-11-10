package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"gnani-hackathon/backend/internal/service"
)

const maxRequestBodyBytes = 1 << 20

// DeliveryService is the service surface used by the delivery handlers.
type DeliveryService interface {
	Validate(ctx context.Context, in service.ValidateInput) (service.ValidationResult, error)
	Create(ctx context.Context, in service.CreateInput) (service.CreateResult, error)
}

// DeliveryHandler exposes delivery-note validation and recording endpoints.
type DeliveryHandler struct {
	Svc DeliveryService
}

type validateOrderRequest struct {
	PONumber           string                `json:"poNumber"`
	DeliveryNoteNumber string                `json:"deliveryNoteNumber"`
	Supplier           string                `json:"supplier"`
	DeliveryDate       string                `json:"deliveryDate"`
	Site               string                `json:"site"`
	Items              []validateItemRequest `json:"items"`
	RawOCRText         *string               `json:"rawOcrText"`
}

type validateItemRequest struct {
	POItemID         *string      `json:"poItemId"`
	Description      string       `json:"description"`
	Quantity         *json.Number `json:"quantity"`
	ReceivedQuantity *json.Number `json:"receivedQuantity"`
}

type createDeliveryRequest struct {
	ClientRequestID    *string             `json:"clientRequestId"`
	PONumber           string              `json:"poNumber"`
	DeliveryNoteNumber string              `json:"deliveryNoteNumber"`
	Supplier           string              `json:"supplier"`
	DeliveryDate       string              `json:"deliveryDate"`
	Site               string              `json:"site"`
	Worker             workerRequest       `json:"worker"`
	VoiceTranscript    *string             `json:"voiceTranscript"`
	RawOCRText         *string             `json:"rawOcrText"`
	Items              []createItemRequest `json:"items"`
}

type workerRequest struct {
	Name       string `json:"name"`
	Identifier string `json:"identifier"`
}

type createItemRequest struct {
	POItemID         string       `json:"poItemId"`
	Description      string       `json:"description"`
	Quantity         *json.Number `json:"quantity"`
	ReceivedQuantity *json.Number `json:"receivedQuantity"`
	DamagedQuantity  *json.Number `json:"damagedQuantity"`
	Remarks          *string      `json:"remarks"`
}

type validateOrderResponse struct {
	Valid        bool                 `json:"valid"`
	Order        *orderResponse       `json:"order"`
	DeliveryNote deliveryNoteResponse `json:"deliveryNote"`
	Issues       []issueResponse      `json:"issues"`
}

type orderResponse struct {
	PONumber             string              `json:"poNumber"`
	Supplier             string              `json:"supplier"`
	Site                 string              `json:"site"`
	Status               string              `json:"status"`
	ExpectedDeliveryDate *string             `json:"expectedDeliveryDate"`
	CancelledAt          *string             `json:"cancelledAt"`
	CancellationReason   *string             `json:"cancellationReason"`
	Items                []orderItemResponse `json:"items"`
}

type orderItemResponse struct {
	ID                string      `json:"id"`
	LineNumber        int         `json:"lineNumber"`
	Description       string      `json:"description"`
	OrderedQuantity   json.Number `json:"orderedQuantity"`
	ReceivedQuantity  json.Number `json:"receivedQuantity"`
	DamagedQuantity   json.Number `json:"damagedQuantity"`
	RemainingQuantity json.Number `json:"remainingQuantity"`
}

type deliveryNoteResponse struct {
	Number          string `json:"number"`
	AlreadyRecorded bool   `json:"alreadyRecorded"`
}

type issueResponse struct {
	Severity    string `json:"severity"`
	Code        string `json:"code"`
	Field       string `json:"field,omitempty"`
	Actual      any    `json:"actual,omitempty"`
	Expected    any    `json:"expected,omitempty"`
	ExpectedMax any    `json:"expectedMax,omitempty"`
	Message     string `json:"message"`
}

type createDeliveryResponse struct {
	ID               string `json:"id"`
	IdempotentReplay bool   `json:"idempotentReplay"`
	OrderStatus      string `json:"orderStatus"`
	RecordedAt       string `json:"recordedAt"`
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
	Issues  []issueResponse   `json:"issues,omitempty"`
}

// Validate handles POST /api/v1/orders/validate.
func (h *DeliveryHandler) Validate(c *gin.Context) {
	var req validateOrderRequest
	if !bindJSON(c, &req) {
		return
	}

	fields := make(map[string]string)
	requireString(fields, "poNumber", req.PONumber, 64)
	requireString(fields, "deliveryNoteNumber", req.DeliveryNoteNumber, 64)
	requireString(fields, "supplier", req.Supplier, 200)
	requireString(fields, "deliveryDate", req.DeliveryDate, 0)
	requireString(fields, "site", req.Site, 200)
	validateOptionalText(fields, "rawOcrText", req.RawOCRText, 20000)
	validateItemsCount(fields, len(req.Items))

	input := service.ValidateInput{
		PONumber:           strings.TrimSpace(req.PONumber),
		DeliveryNoteNumber: strings.TrimSpace(req.DeliveryNoteNumber),
		Supplier:           strings.TrimSpace(req.Supplier),
		DeliveryDate:       strings.TrimSpace(req.DeliveryDate),
		Site:               strings.TrimSpace(req.Site),
		RawOCRText:         trimmedStringPtr(req.RawOCRText),
		Items:              make([]service.ValidateItem, 0, len(req.Items)),
	}

	for index, item := range req.Items {
		prefix := fmt.Sprintf("items[%d]", index)
		requireString(fields, prefix+".description", item.Description, 500)
		quantity := parseQuantity(fields, prefix+".quantity", item.Quantity, true)
		var receivedQuantity *decimal.Decimal
		if item.ReceivedQuantity != nil {
			parsed := parseQuantity(
				fields,
				prefix+".receivedQuantity",
				item.ReceivedQuantity,
				false,
			)
			receivedQuantity = &parsed
		}

		var poItemID *string
		if item.POItemID != nil && strings.TrimSpace(*item.POItemID) != "" {
			parsed, err := uuid.Parse(strings.TrimSpace(*item.POItemID))
			if err != nil {
				fields[prefix+".poItemId"] = "must be a UUID"
			} else {
				normalized := parsed.String()
				poItemID = &normalized
			}
		}

		input.Items = append(input.Items, service.ValidateItem{
			POItemID:         poItemID,
			Description:      strings.TrimSpace(item.Description),
			Quantity:         quantity,
			ReceivedQuantity: receivedQuantity,
		})
	}

	if len(fields) > 0 {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.", fields, nil)
		return
	}

	result, err := h.Svc.Validate(c.Request.Context(), input)
	if err != nil {
		slog.Error("validate delivery note", "error", err)
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not validate the delivery note.", nil, nil)
		return
	}

	c.JSON(http.StatusOK, toValidateOrderResponse(result))
}

// Create handles POST /api/v1/deliveries.
func (h *DeliveryHandler) Create(c *gin.Context) {
	var req createDeliveryRequest
	if !bindJSON(c, &req) {
		return
	}

	fields := make(map[string]string)
	requireString(fields, "poNumber", req.PONumber, 64)
	requireString(fields, "deliveryNoteNumber", req.DeliveryNoteNumber, 64)
	requireString(fields, "supplier", req.Supplier, 200)
	requireString(fields, "deliveryDate", req.DeliveryDate, 0)
	requireString(fields, "site", req.Site, 200)
	requireString(fields, "worker.name", req.Worker.Name, 200)
	requireString(fields, "worker.identifier", req.Worker.Identifier, 200)

	clientRequestID := trimmedStringPtr(req.ClientRequestID)
	if clientRequestID != nil {
		length := utf8.RuneCountInString(*clientRequestID)
		if length < 8 || length > 128 {
			fields["clientRequestId"] = "must be between 8 and 128 characters"
		}
	}

	validateOptionalText(fields, "voiceTranscript", req.VoiceTranscript, 20000)
	validateOptionalText(fields, "rawOcrText", req.RawOCRText, 20000)
	validateItemsCount(fields, len(req.Items))

	input := service.CreateInput{
		ClientRequestID:    clientRequestID,
		PONumber:           strings.TrimSpace(req.PONumber),
		DeliveryNoteNumber: strings.TrimSpace(req.DeliveryNoteNumber),
		Supplier:           strings.TrimSpace(req.Supplier),
		DeliveryDate:       strings.TrimSpace(req.DeliveryDate),
		Site:               strings.TrimSpace(req.Site),
		WorkerName:         strings.TrimSpace(req.Worker.Name),
		WorkerIdentifier:   strings.TrimSpace(req.Worker.Identifier),
		VoiceTranscript:    trimmedStringPtr(req.VoiceTranscript),
		RawOCRText:         trimmedStringPtr(req.RawOCRText),
		Items:              make([]service.CreateItem, 0, len(req.Items)),
	}

	for index, item := range req.Items {
		prefix := fmt.Sprintf("items[%d]", index)

		var normalizedPOItemID string
		trimmedID := strings.TrimSpace(item.POItemID)
		switch {
		case trimmedID == "":
			fields[prefix+".poItemId"] = "required"
		default:
			parsed, err := uuid.Parse(trimmedID)
			if err != nil {
				fields[prefix+".poItemId"] = "must be a UUID"
			} else {
				normalizedPOItemID = parsed.String()
			}
		}

		requireString(fields, prefix+".description", item.Description, 500)
		quantity := parseQuantity(fields, prefix+".quantity", item.Quantity, true)
		receivedQuantity := parseQuantity(fields, prefix+".receivedQuantity", item.ReceivedQuantity, false)
		damagedQuantity := parseQuantity(fields, prefix+".damagedQuantity", item.DamagedQuantity, false)
		validateOptionalText(fields, prefix+".remarks", item.Remarks, 1000)

		input.Items = append(input.Items, service.CreateItem{
			POItemID:         normalizedPOItemID,
			Description:      strings.TrimSpace(item.Description),
			Quantity:         quantity,
			ReceivedQuantity: receivedQuantity,
			DamagedQuantity:  damagedQuantity,
			Remarks:          trimmedStringPtr(item.Remarks),
		})
	}

	if len(fields) > 0 {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.", fields, nil)
		return
	}

	result, err := h.Svc.Create(c.Request.Context(), input)
	if err != nil {
		var validationErr *service.ValidationError
		if errors.As(err, &validationErr) {
			respondError(
				c,
				http.StatusUnprocessableEntity,
				"VALIDATION_FAILED",
				"Delivery note does not match the purchase order.",
				nil,
				toIssueResponses(validationErr.Result.Issues),
			)
			return
		}
		if errors.Is(err, service.ErrDuplicateDelivery) {
			respondError(
				c,
				http.StatusConflict,
				"DELIVERY_ALREADY_RECORDED",
				"This delivery note is already recorded for the purchase order.",
				nil,
				nil,
			)
			return
		}

		slog.Error("create delivery", "error", err)
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not record the delivery.", nil, nil)
		return
	}

	status := http.StatusCreated
	if result.IdempotentReplay {
		status = http.StatusOK
	}

	c.JSON(status, createDeliveryResponse{
		ID:               result.ID,
		IdempotentReplay: result.IdempotentReplay,
		OrderStatus:      result.OrderStatus,
		RecordedAt:       result.RecordedAt.UTC().Format(time.RFC3339),
	})
}

func bindJSON(c *gin.Context, destination any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRequestBodyBytes)
	if err := c.ShouldBindJSON(destination); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			respondError(c, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "Request body is too large.", nil, nil)
			return false
		}
		respondError(
			c,
			http.StatusBadRequest,
			"INVALID_REQUEST",
			"Request body is invalid.",
			map[string]string{"body": "must be valid JSON matching the request schema"},
			nil,
		)
		return false
	}
	return true
}

func requireString(fields map[string]string, key, value string, max int) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		fields[key] = "required"
		return
	}
	if max > 0 && utf8.RuneCountInString(trimmed) > max {
		fields[key] = fmt.Sprintf("must be at most %d characters", max)
	}
}

func validateOptionalText(fields map[string]string, key string, value *string, max int) {
	if value == nil {
		return
	}
	if utf8.RuneCountInString(strings.TrimSpace(*value)) > max {
		fields[key] = fmt.Sprintf("must be at most %d characters", max)
	}
}

func validateItemsCount(fields map[string]string, count int) {
	if count == 0 {
		fields["items"] = "must contain at least one item"
		return
	}
	if count > 100 {
		fields["items"] = "must contain at most 100 items"
	}
}

func parseQuantity(fields map[string]string, key string, value *json.Number, positive bool) decimal.Decimal {
	if value == nil {
		fields[key] = "required"
		return decimal.Zero
	}

	quantity, err := decimal.NewFromString(value.String())
	if err != nil {
		fields[key] = "must be a decimal number"
		return decimal.Zero
	}
	if quantity.Round(3).Cmp(quantity) != 0 {
		fields[key] = "must have at most 3 decimal places"
		return quantity
	}
	if positive {
		if !quantity.IsPositive() {
			fields[key] = "must be greater than zero"
		}
	} else if quantity.IsNegative() {
		fields[key] = "must be zero or greater"
	}

	return quantity
}

func respondError(c *gin.Context, status int, code, message string, fields map[string]string, issues []issueResponse) {
	c.JSON(status, errorEnvelope{
		Error: errorBody{
			Code:    code,
			Message: message,
			Fields:  fields,
			Issues:  issues,
		},
	})
}

func toValidateOrderResponse(result service.ValidationResult) validateOrderResponse {
	response := validateOrderResponse{
		Valid: result.Valid,
		DeliveryNote: deliveryNoteResponse{
			Number:          result.DeliveryNote.Number,
			AlreadyRecorded: result.DeliveryNote.AlreadyRecorded,
		},
		Issues: toIssueResponses(result.Issues),
	}
	if result.Order != nil {
		response.Order = toOrderResponse(result.Order)
	}
	return response
}

func toOrderResponse(order *service.OrderView) *orderResponse {
	response := &orderResponse{
		PONumber:             order.PONumber,
		Supplier:             order.Supplier,
		Site:                 order.Site,
		Status:               order.Status,
		ExpectedDeliveryDate: order.ExpectedDeliveryDate,
		CancelledAt:          order.CancelledAt,
		CancellationReason:   order.CancellationReason,
		Items:                make([]orderItemResponse, 0, len(order.Items)),
	}
	for _, item := range order.Items {
		response.Items = append(response.Items, orderItemResponse{
			ID:                item.ID,
			LineNumber:        item.LineNumber,
			Description:       item.Description,
			OrderedQuantity:   decimalJSON(item.OrderedQuantity),
			ReceivedQuantity:  decimalJSON(item.ReceivedQuantity),
			DamagedQuantity:   decimalJSON(item.DamagedQuantity),
			RemainingQuantity: decimalJSON(item.RemainingQuantity),
		})
	}
	return response
}

func toIssueResponses(issues []service.Issue) []issueResponse {
	response := make([]issueResponse, 0, len(issues))
	for _, issue := range issues {
		response = append(response, issueResponse{
			Severity:    issue.Severity,
			Code:        issue.Code,
			Field:       issue.Field,
			Actual:      issueValue(issue.Actual),
			Expected:    issueValue(issue.Expected),
			ExpectedMax: issueValue(issue.ExpectedMax),
			Message:     issue.Message,
		})
	}
	return response
}

func issueValue(value any) any {
	if quantity, ok := value.(decimal.Decimal); ok {
		return decimalJSON(quantity)
	}
	return value
}

func decimalJSON(value decimal.Decimal) json.Number {
	return json.Number(value.String())
}

func trimmedStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
