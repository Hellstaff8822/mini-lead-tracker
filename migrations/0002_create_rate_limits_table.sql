CREATE TABLE rate_limits (
    ip TEXT PRIMARY KEY,
    requests_count INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_limits_reset_at ON rate_limits(reset_at);