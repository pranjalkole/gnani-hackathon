GO ?= go
PSQL ?= psql
DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/gnani?sslmode=disable
GOOSE = $(GO) run github.com/pressly/goose/v3/cmd/goose@latest

.PHONY: run build test fmt vet tidy migrate-up migrate-down migrate-status seed seed-local

run:
	$(GO) run ./cmd/api

build:
	$(GO) build -o bin/api ./cmd/api

test:
	$(GO) test ./...

fmt:
	$(GO) fmt ./...

vet:
	$(GO) vet ./...

tidy:
	$(GO) mod tidy

migrate-up:
	$(GOOSE) -dir migrations postgres "$(DATABASE_URL)" up

migrate-down:
	$(GOOSE) -dir migrations postgres "$(DATABASE_URL)" down

migrate-status:
	$(GOOSE) -dir migrations postgres "$(DATABASE_URL)" status

seed:
	docker compose exec -T db psql -U postgres -d gnani < scripts/seed_dev.sql

seed-local:
	$(PSQL) "$(DATABASE_URL)" -f scripts/seed_dev.sql
