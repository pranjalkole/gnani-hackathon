package store

import (
	"time"

	"github.com/shopspring/decimal"
)

// PurchaseOrder is a purchase order header with its order lines.
type PurchaseOrder struct {
	ID                   string
	PONumber             string
	SupplierName         string
	SiteName             string
	Status               string
	ExpectedDeliveryDate *time.Time
	CancelledAt          *time.Time
	CancellationReason   *string
	Items                []PurchaseOrderItem
}

// PurchaseOrderItem is one expected line on a purchase order.
type PurchaseOrderItem struct {
	ID               string
	LineNumber       int
	Description      string
	OrderedQuantity  decimal.Decimal
	ReceivedQuantity decimal.Decimal
	DamagedQuantity  decimal.Decimal
}

// RemainingQuantity is the quantity that still needs to be received in good
// condition. Damaged units do not count toward fulfilling the order.
func (i PurchaseOrderItem) RemainingQuantity() decimal.Decimal {
	remaining := i.OrderedQuantity.Sub(i.ReceivedQuantity)
	if remaining.IsNegative() {
		return decimal.Zero
	}
	return remaining
}

// Delivery is a recorded delivery header. Items are populated when a full
// delivery is fetched; the create response only needs the header.
type Delivery struct {
	ID                 string
	ClientRequestID    *string
	PurchaseOrderID    string
	PONumber           string
	DeliveryNoteNumber string
	SupplierName       string
	SiteName           string
	DeliveryDate       time.Time
	WorkerName         string
	WorkerIdentifier   string
	VoiceTranscript    *string
	RawOCRText         *string
	OrderStatus        string
	CreatedAt          time.Time
	Items              []DeliveryItem
}

// DeliveryItem is one recorded line on a delivery.
type DeliveryItem struct {
	ID                  string
	PurchaseOrderItemID string
	Description         string
	NoteQuantity        decimal.Decimal
	ReceivedQuantity    decimal.Decimal
	DamagedQuantity     decimal.Decimal
	Remarks             *string
}

// CreateDeliveryInput is the fully validated data needed to persist a
// delivery. Supplier, site, and descriptions are canonical values from the
// purchase order, not the raw values typed by the worker.
type CreateDeliveryInput struct {
	ClientRequestID    *string
	PurchaseOrderID    string
	PONumber           string
	DeliveryNoteNumber string
	SupplierName       string
	SiteName           string
	DeliveryDate       time.Time
	WorkerName         string
	WorkerIdentifier   string
	VoiceTranscript    *string
	RawOCRText         *string
	Items              []CreateDeliveryItem
}

// CreateDeliveryItem is one validated delivery line.
type CreateDeliveryItem struct {
	PurchaseOrderItemID string
	Description         string
	NoteQuantity        decimal.Decimal
	ReceivedQuantity    decimal.Decimal
	DamagedQuantity     decimal.Decimal
	Remarks             *string
}

// CreateDeliveryResult is returned after a successful insert. IdempotentReplay
// is true when the client request ID already existed and no new row was
// written.
type CreateDeliveryResult struct {
	Delivery         *Delivery
	IdempotentReplay bool
}
