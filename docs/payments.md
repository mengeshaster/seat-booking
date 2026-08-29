# Payment simulation

The payment adapter sends authorization requests to `PAYMENT_PROVIDER_API_URL` and tells the provider to call back at `PUBLIC_WEBHOOK_URL`.

Set these values in `seat-booking-server/.env`:

```dotenv
PAYMENT_PROVIDER_API_URL="https://payment-provider.example/api/payments"
PUBLIC_WEBHOOK_URL="https://example-tunnel.test"
```

`PAYMENT_PROVIDER_API_URL` is required at process start. `PUBLIC_WEBHOOK_URL` is required when confirming a hold. It must be a publicly reachable HTTPS base URL that forwards to the local API. The adapter appends `/api/v1/payments/payment-status` when it sends the callback target to the provider.

Configure the provider's asynchronous callback target as:

```text
${PUBLIC_WEBHOOK_URL}/api/v1/payments/payment-status
```

## Confirm a held seat

Payment authorization is part of hold confirmation:

```bash
curl -X POST "http://localhost:3000/api/v1/holds/<HOLD_ID>/confirm" \
  -H "Idempotency-Key: confirmation-attempt-001"
```

The first successful request returns `201` with a pending booking. A retry using the same idempotency key returns `200` with the stored booking.

The server generates a booking ID, sends it with the server-derived amount and user context to `PAYMENT_PROVIDER_API_URL`, then opens the database confirmation transaction. The provider must immediately return a pending authorization and echo the booking ID. If the transaction fails, the server sends a compensating authorization void request to the same URL.

## Provider responses

The immediate response must contain an authorization identifier and the booking ID:

```json
{
  "message": "Payment authorization initiated",
  "providerEventId": "provider-authorization-id",
  "bookingId": "the-booking-id-sent-by-the-server",
  "status": "pending"
}
```

Configure the asynchronous callback body to match the payment webhook schema:

```json
{
  "providerEventId": "provider-event-uuid",
  "bookingId": "the-booking-id-sent-by-the-server",
  "occurredAt": "2026-07-18T10:00:00.000Z",
  "payload": {
    "status": "success",
    "paymentId": "provider-payment-id"
  }
}
```

The webhook stores `providerEventId` in `payment_events`. Replaying an event is idempotent. Older unseen events are retained but do not replace a newer settlement.

A development provider is not a production integration. Production providers must authenticate webhook signatures and use a real authorization/void API.

## Development data

Reset and seed the local database after migrations:

```bash
make migrate
make seed
```

The seed command runs only when `NODE_ENV=development`. It removes existing booking-domain data and creates 100 users, 20 upcoming events, 4,000 seats, active and confirmed holds, pending and paid bookings, payment events, and published outbox records.
