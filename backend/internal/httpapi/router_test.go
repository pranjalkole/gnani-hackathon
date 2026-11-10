package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gnani-hackathon/backend/internal/config"
)

func testRouter() http.Handler {
	return NewRouter(config.Config{Env: "test", CORSOrigins: []string{"*"}}, nil)
}

func TestLiveness(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	testRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
}

func TestPing(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ping", nil)
	rec := httptest.NewRecorder()

	testRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"message":"pong"`) {
		t.Fatalf("unexpected body: %s", body)
	}
}
