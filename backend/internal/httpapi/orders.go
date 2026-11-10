package httpapi

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"gnani-hackathon/backend/internal/service"
)

// OrderService is the service surface used by the supervisor order handler.
type OrderService interface {
	ListOrders(ctx context.Context) ([]service.OrderView, error)
}

// OrderHandler exposes read-only purchase order endpoints.
type OrderHandler struct {
	Svc OrderService
}

type listOrdersResponse struct {
	Orders []orderResponse `json:"orders"`
}

// List handles GET /api/v1/orders.
func (h *OrderHandler) List(c *gin.Context) {
	orders, err := h.Svc.ListOrders(c.Request.Context())
	if err != nil {
		slog.Error("list purchase orders", "error", err)
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not load purchase orders.", nil, nil)
		return
	}

	response := make([]orderResponse, 0, len(orders))
	for index := range orders {
		response = append(response, *toOrderResponse(&orders[index]))
	}

	c.JSON(http.StatusOK, listOrdersResponse{Orders: response})
}
