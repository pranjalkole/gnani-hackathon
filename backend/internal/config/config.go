package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds runtime configuration loaded from environment variables.
type Config struct {
	Env             string
	Addr            string
	DatabaseURL     string
	CORSOrigins     []string
	ShutdownTimeout time.Duration
	DBMaxConns      int32
	DBMinConns      int32
}

// Load builds a Config from the environment, applying sensible development
// defaults for anything that is not set.
func Load() Config {
	addr := env("ADDR", "")
	if addr == "" {
		addr = ":" + env("PORT", "8080")
	}

	return Config{
		Env:             env("APP_ENV", "development"),
		Addr:            addr,
		DatabaseURL:     env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/gnani?sslmode=disable"),
		CORSOrigins:     envList("CORS_ORIGINS", "*"),
		ShutdownTimeout: envDuration("SHUTDOWN_TIMEOUT", 10*time.Second),
		DBMaxConns:      int32(envInt("DB_MAX_CONNS", 10)),
		DBMinConns:      int32(envInt("DB_MIN_CONNS", 1)),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func envList(key, fallback string) []string {
	parts := strings.Split(env(key, fallback), ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
