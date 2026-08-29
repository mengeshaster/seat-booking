UPDATE bookings
SET last_payment_applied_at = latest_payment_event.occurred_at
FROM (
    SELECT booking_id, MAX(occurred_at) AS occurred_at
    FROM payment_events
    GROUP BY booking_id
) AS latest_payment_event
WHERE bookings.id = latest_payment_event.booking_id
  AND (
      bookings.last_payment_applied_at IS NULL
      OR bookings.last_payment_applied_at < latest_payment_event.occurred_at
  );
