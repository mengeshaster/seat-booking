ALTER TABLE bookings
    ADD COLUMN last_payment_applied_at TIMESTAMPTZ;

CREATE INDEX bookings_last_payment_applied_at_idx
    ON bookings(last_payment_applied_at)
    WHERE last_payment_applied_at IS NOT NULL;
