package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"gnani-hackathon/backend/internal/config"
	"gnani-hackathon/backend/internal/service"
	"gnani-hackathon/backend/internal/store"
)

// NewRouter wires middleware and routes for the HTTP API.
func NewRouter(cfg config.Config, db *pgxpool.Pool) *gin.Engine {
	svc := service.New(store.New(db))
	return newRouter(cfg, db, svc, svc)
}

func newRouter(cfg config.Config, db *pgxpool.Pool, deliverySvc DeliveryService, orderSvc OrderService) *gin.Engine {
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	origins := cfg.CORSOrigins
	if len(origins) == 0 {
		origins = []string{"*"}
	}

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins: origins,
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
		MaxAge:       12 * time.Hour,
	}))

	health := &HealthHandler{DB: db}
	r.GET("/healthz", health.Live)
	r.GET("/readyz", health.Ready)

	v1 := r.Group("/api/v1")
	{
		v1.GET("/ping", ping)

		if deliverySvc != nil {
			deliveries := &DeliveryHandler{Svc: deliverySvc}
			v1.POST("/orders/validate", deliveries.Validate)
			v1.POST("/deliveries", deliveries.Create)
		}

		if orderSvc != nil {
			orders := &OrderHandler{Svc: orderSvc}
			v1.GET("/orders", orders.List)
		}
	}

	return r
}

func ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "pong"})
}
