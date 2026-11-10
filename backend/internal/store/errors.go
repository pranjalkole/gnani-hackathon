package store

import (
	"errors"
	"fmt"

	"github.com/shopspring/decimal"
)

var (
	ErrUnavailable               = errors.New("store: database unavailable")
	ErrNotFound                  = errors.New("store: not found")
	ErrDuplicateDelivery         = errors.New("store: duplicate delivery")
	ErrDuplicateItem             = errors.New("store: duplicate delivery item")
	ErrOrderNotOpen              = errors.New("store: purchase order is not open")
	ErrPurchaseOrderItemNotFound = errors.New("store: purchase order item not found")
	ErrInvalidQuantity           = errors.New("store: invalid quantity")
	ErrQuantityConflict          = errors.New("store: quantity conflict")
)

// QuantityConflictError reports that a delivery line would exceed the
// remaining quantity on a purchase order item.
type QuantityConflictError struct {
	ItemID    string
	Remaining decimal.Decimal
}

func (e *QuantityConflictError) Error() string {
	return fmt.Sprintf("store: item %s has only %s remaining", e.ItemID, e.Remaining)
}

func (e *QuantityConflictError) Unwrap() error {
	return ErrQuantityConflict
}
