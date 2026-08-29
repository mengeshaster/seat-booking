CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    city TEXT,
    state_or_province TEXT,
    postal_code TEXT,
    country_code CHAR(2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (email = lower(email)),
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

INSERT INTO users (id, email, full_name)
SELECT user_id, lower(user_id::text || '@legacy.invalid'), 'Legacy user'
FROM (
    SELECT user_id FROM holds
    UNION
    SELECT user_id FROM bookings
) AS legacy_users
ON CONFLICT (id) DO NOTHING;

ALTER TABLE holds
    ADD CONSTRAINT holds_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE bookings
    ADD CONSTRAINT bookings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
