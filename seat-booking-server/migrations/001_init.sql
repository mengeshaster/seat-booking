CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE hold_status AS ENUM ('active', 'released', 'expired', 'confirmed');
CREATE TYPE booking_status AS ENUM ('pending', 'paid', 'failed');

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    row_label TEXT NOT NULL,
    seat_number INT NOT NULL,
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    version INT NOT NULL DEFAULT 0,
    UNIQUE (event_id, row_label, seat_number)
);

CREATE INDEX seats_event_id_idx ON seats(event_id);

CREATE TABLE holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL,
    status hold_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX holds_active_expires_at_idx
    ON holds(expires_at)
    WHERE status = 'active';

CREATE TABLE hold_seats (
    hold_id UUID NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
    hold_status hold_status NOT NULL DEFAULT 'active',
    locked_seat_id UUID GENERATED ALWAYS AS (
        CASE
            WHEN hold_status IN ('active', 'confirmed') THEN seat_id
            ELSE NULL
        END
    ) STORED,
    PRIMARY KEY (hold_id, seat_id),
    UNIQUE (locked_seat_id)
);

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hold_id UUID NOT NULL UNIQUE REFERENCES holds(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL,
    amount_cents INT NOT NULL CHECK (amount_cents >= 0),
    status booking_status NOT NULL DEFAULT 'pending',
    idempotency_key TEXT NOT NULL UNIQUE,
    response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX outbox_unpublished_id_idx
    ON outbox(id)
    WHERE published_at IS NULL;

CREATE TABLE payment_events (
    provider_event_id TEXT PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL
);

CREATE INDEX payment_events_booking_id_idx ON payment_events(booking_id);
