CREATE TABLE IF NOT EXISTS notification_deliveries (
    message_id BIGINT PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('processing', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
