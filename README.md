# Seat Booking

Seat Booking is a pnpm monorepo for a seat-reservation workflow. It provides a TypeScript/Express booking API, asynchronous booking notifications, shared cross-service packages, and local infrastructure for development.

## Architecture

The booking server is the source of truth for seats, holds, bookings, and payment state. HTTP requests are handled synchronously. Hold expiry, event publishing, payment settlement, and email are asynchronous.

```text
Client
  │ sync HTTP
  ▼
seat-booking-server ── PostgreSQL
  │  API + hold sweeper + outbox publisher
  │
  │ async booking.confirmed
  ▼
RabbitMQ ──► notification-service ──► MailHog
  ▲
  │ async webhook
payment provider
```

**Synchronous:** browse events, create a hold, confirm a hold (authorize payment, then write the booking and outbox row in one transaction).

**Asynchronous:** expire stale holds, publish outbox events to RabbitMQ, apply payment webhooks, send confirmation email.

The full process map, layering, stack rationale, and invariants are in [docs/architecture.md](docs/architecture.md).

## Workspace layout

| Path | Purpose |
| --- | --- |
| `seat-booking-server/` | Express API, PostgreSQL migrations, payment flow, hold sweeper, and outbox publisher |
| `notification-service/` | RabbitMQ consumer and email delivery tracking |
| `packages/errors/` | Shared domain error types |
| `packages/http/` | Shared Express request middleware |
| `packages/messaging/` | RabbitMQ contracts and topology helpers |
| `packages/observability/` | Structured logging and request context |
| `docs/` | Development and operational documentation |

## Prerequisites

- Node.js 20 or newer
- pnpm 10 (`corepack enable` can install the configured pnpm version)
- Docker Desktop and Docker Compose
- GNU Make, or the equivalent `pnpm` commands below

## First-time setup

1. Install workspace dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Create local environment files:

   ```bash
   cp seat-booking-server/.env.example seat-booking-server/.env
   cp notification-service/.env.example notification-service/.env
   ```

   On PowerShell, use `Copy-Item` instead of `cp`.

3. Start PostgreSQL, RabbitMQ, and MailHog:

   ```bash
   make db
   ```

4. Apply the database migrations:

   ```bash
   make migrate
   make notification-migrate
   ```

5. Optionally reset and load deterministic development data:

   ```bash
   make seed
   ```

   The seed command requires `NODE_ENV=development` and removes existing booking-domain data.

## Run locally

Start the API:

```bash
pnpm --dir seat-booking-server dev:start-server
```

In a second terminal, start the notification consumer:

```bash
pnpm --dir notification-service dev
```

Local endpoints:

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api-docs`
- RabbitMQ management UI: `http://localhost:15672` (`guest` / `guest`)
- MailHog inbox: `http://localhost:8025`

## Common commands

| Command | Description |
| --- | --- |
| `make db` | Start PostgreSQL, RabbitMQ, and MailHog |
| `make migrate` | Apply booking-server migrations |
| `make seed` | Reset and seed development booking data |
| `make notification-migrate` | Apply notification-service migrations |
| `make notification-service` | Start the notification service |
| `pnpm --dir seat-booking-server build` | Build the booking API and shared packages |
| `pnpm --dir notification-service build` | Build the notification service |
| `pnpm --dir seat-booking-server job:hold-sweeper` | Run the hold sweeper independently |
| `pnpm --dir seat-booking-server job:outbox-publisher` | Run the outbox publisher independently |

## Booking lifecycle

1. List events and their seats with `GET /api/v1/events` and `GET /api/v1/events/:id/seats`.
2. Create a ten-minute hold with `POST /api/v1/events/:id/holds`.
3. Confirm the hold with `POST /api/v1/holds/:id/confirm` and an `Idempotency-Key` header.
4. The server generates a booking ID, authorizes payment, then atomically confirms the hold, creates the booking, and records a `booking.confirmed` outbox event.
5. The payment provider calls `POST /api/v1/payments/payment-status`. Duplicate provider events are recorded once; older unseen events do not override newer settlements.
6. RabbitMQ delivers the booking event to the notification service, which sends an email through MailHog.

For payment-provider setup, webhook payloads, and notification behavior, see [docs/payments.md](docs/payments.md) and [docs/notifications.md](docs/notifications.md).

## Configuration

`seat-booking-server/.env` contains API, database, RabbitMQ, and payment-provider settings. `notification-service/.env` contains its database, RabbitMQ, and SMTP settings. Use the corresponding `.env.example` files as the authoritative templates. Do not commit `.env` files.

`PAYMENT_PROVIDER_API_URL` is required at process start. `PUBLIC_WEBHOOK_URL` is required before confirming a hold. It must be a publicly reachable HTTPS URL that forwards to the local API. See the payment guide for the callback path the adapter appends.

## Development notes

- The API uses structured JSON logs with a request ID.
- Active or confirmed seats are protected by a database uniqueness constraint; attempting to hold one returns `409 Conflict`.
- A confirmation retry with the same `Idempotency-Key` returns the originally stored booking.
- Payment initiation uses `PAYMENT_PROVIDER_API_URL`. A production integration must verify webhook signatures and use a real authorization/void API.

## Documentation

- [Seat booking server architecture](docs/architecture.md)
- [Payment simulation and webhooks](docs/payments.md)
- [Notification service](docs/notifications.md)
