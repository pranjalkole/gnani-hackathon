package store

import "github.com/jackc/pgx/v5/pgxpool"

// Store contains PostgreSQL-backed queries used by the delivery service.
type Store struct {
	db *pgxpool.Pool
}

// New creates a store. A nil pool is allowed so the router can be constructed
// without a database in tests; queries return ErrUnavailable instead of
// panicking.
func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) available() error {
	if s.db == nil {
		return ErrUnavailable
	}
	return nil
}
