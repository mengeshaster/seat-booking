# Seat booking server architecture

This document describes how `seat-booking-server` works: the request path, how processes are managed, synchronous and asynchronous communication, and why the current stack is used.

For local setup, see the [root README](../README.md). For payment-provider and notification operations, see [payments.md](payments.md) and [notifications.md](notifications.md).

## What the system does

The booking server sells event seats without double-booking them.

1. A client lists events and seats.
2. The client places a short-lived hold on one or more seats.
3. The client confirms the hold. The server authorizes payment first, then writes the booking in one database transaction.
4. A later payment webhook marks the booking paid.
5. A `booking.confirmed` event is published after the transaction commits, and a separate service emails the customer.

The server is the source of truth for inventory, money amounts, and booking state. Clients do not set prices or settlement status.

## System context

```text
                         ┌─────────────────────────────┐
                         │           Client            │
                         └──────────────┬──────────────┘
                                        │ HTTP (sync)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         seat-booking-server                              │
│                                                                          │
│   HTTP API          Hold sweeper           Outbox publisher              │
│   (Express)         every 10s              every 1s                      │
│        │                 │                      │                        │
│        └────────┬────────┴──────────┬───────────┘                        │
│                 ▼                   ▼                                    │
│            PostgreSQL          RabbitMQ                                  │
└──────────────────────────────────────────────────────────────────────────┘
                 ▲                   │
                 │                   │ booking.confirmed
                 │                   ▼
                 │          notification-service
                 │                   │ SMTP
                 │                   ▼
           payment webhook        MailHog
           (async HTTP)
```

The booking API, hold sweeper, and outbox publisher run in the same Node process during local development. The notification consumer is a separate process so email delivery cannot block seat reservation.

## Process model

| Process | Starts from | Role |
| --- | --- | --- |
| Booking API + in-process jobs | `pnpm --dir seat-booking-server dev:start-server` | Serves HTTP, expires holds, publishes outbox events |
| Hold sweeper (standalone) | `pnpm --dir seat-booking-server job:hold-sweeper` | Same expiry job, isolated process |
| Outbox publisher (standalone) | `pnpm --dir seat-booking-server job:outbox-publisher` | Same publish job, isolated process |
| Notification consumer | `pnpm --dir notification-service dev` | Consumes RabbitMQ and sends email |
| PostgreSQL, RabbitMQ, MailHog | `make db` | Local infrastructure |

`src/server.ts` boots in this order:

1. Connect the PostgreSQL pool.
2. Create the HTTP server from `src/app.ts`.
3. Start the hold sweeper and outbox publisher.
4. Listen on `PORT` (default `3000`).
5. On `SIGINT` / `SIGTERM`, close HTTP, stop jobs, then disconnect the pool.

Jobs skip a tick if the previous tick is still running. The outbox publisher reconnects to RabbitMQ after a connection failure.

## Layering inside the server

Each HTTP request travels top to bottom through a fixed stack. Business rules stay out of routes; SQL stays out of services.

```text
Client
  │
  ▼
requestId  →  CORS  →  JSON body  →  route  →  Zod schema
                                              │
                                              ▼
                                           service
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
              repository               PaymentProvider            (errors)
                     │                        │
                     ▼                        ▼
               PostgreSQL              PAYMENT_PROVIDER_API_URL
```

| Layer | Responsibility | Typical files |
| --- | --- | --- |
| HTTP | Parse headers, validate input, map results to status codes | `*.routes.ts`, `@seat-booking/http` |
| Service | Orchestrate use cases across repositories and adapters | `*.service.ts` |
| Repository | Transactions, locks, SQL | `*.repository.ts` |
| Port / adapter | External payment API | `payment.provider.ts`, `adapters/` |
| Shared packages | Errors, logging, messaging contracts | `packages/*` |

Modules live under `seat-booking-server/src/modules/{events,holds,bookings,payments,users}`. Each module owns its schema, types, service, and repository.

## Synchronous communication

These paths complete inside the HTTP request. The client waits for a response.

### Request lifecycle

1. `requestId` reads `x-request-id` or generates a UUID, stores it on the response, and binds it to structured logs.
2. The route validates params, query, and body with Zod.
3. Confirmation also requires an `Idempotency-Key` header.
4. The service runs the use case.
5. Success returns JSON. Failures become domain errors and map to HTTP status in `shared/error-handler.ts`.

| Error | Status | Typical cause |
| --- | --- | --- |
| `ValidationError` | 400 | Invalid UUID, missing seats, bad webhook body |
| `NotFoundError` | 404 | Unknown route or resource |
| `ConflictError` | 409 | Seat already held or idempotency key reused on another hold |
| `GoneError` | 410 | Hold expired or no longer active |
| Other | 500 | Unexpected failure |

### HTTP surface

All versioned routes sit under `/api/v1`. Swagger UI is at `/api-docs`.

```text
GET    /events
GET    /events/:id
GET    /events/:id/seats
POST   /events/:id/holds          → create 10-minute hold

DELETE /holds/:id
POST   /holds/:id/confirm         → authorize payment, then write booking

GET    /bookings/:id/seats
GET    /bookings/:idempotencyKey
PUT    /bookings/:id/status
DELETE /bookings/:id

POST   /users
GET    /users/:id

POST   /payments/payment-status   → settlement webhook
POST   /webhooks/payment-status   → same handler, alternate prefix
```

### Hold creation (sync)

```text
Client
  │ POST /events/:id/holds { userId, seatIds }
  ▼
events.routes → holds.service.createHold
  │
  ▼
holds.repository.create  (one transaction)
  1. SELECT seats FOR UPDATE          lock inventory rows
  2. Reject seats that are not on this event
  3. Reject seats already active or confirmed
  4. INSERT holds + hold_seats
```

Seat exclusivity is also enforced in the database. `hold_seats.locked_seat_id` is a generated column that equals `seat_id` only while the row is `active` or `confirmed`, and it is unique. Released or expired seats become available again.

### Confirmation (sync HTTP, sync payment authorize, then sync DB)

Payment authorization happens **before** the confirmation transaction, using a booking ID the server generates itself.

```text
Client
  │ POST /holds/:id/confirm
  │ Idempotency-Key: ...
  ▼
holds.service.confirmHold
  │
  ├─ PostgreSQL advisory lock on the idempotency key
  ├─ If a booking already exists for that key, return it (HTTP 200)
  ├─ Load hold amount and user from stored seats
  ├─ bookingId = randomUUID()
  │
  ├─ PaymentProvider.authorize(...)          HTTP to PAYMENT_PROVIDER_API_URL
  │     bookingId, userId, amountCents,
  │     idempotency key, webhook URL
  │     ◄── pending authorizationId
  │
  ├─ PostgreSQL transaction
  │     INSERT booking (id = bookingId, status = pending)
  │     UPDATE hold + hold_seats → confirmed
  │     INSERT outbox (booking.confirmed)
  │
  └─ If the transaction fails → PaymentProvider.voidAuthorization
```

The client receives `201` and a pending booking. Settlement is not part of this request.

## Asynchronous communication

These paths continue after the HTTP response, or arrive later from another system.

### Payment settlement webhook

A cloud payment provider cannot call `localhost`. `PUBLIC_WEBHOOK_URL` is a public HTTPS base URL that forwards to the local API.

```text
Payment provider
  │ POST {PUBLIC_WEBHOOK_URL}/api/v1/payments/payment-status
  │ { providerEventId, bookingId, occurredAt, payload }
  ▼
payment.service.receivePaymentWebhook
  │
  ▼
one transaction
  1. INSERT payment_events ON CONFLICT (provider_event_id) DO NOTHING
  2. Duplicate event → { duplicate: true }, booking unchanged
  3. New event → UPDATE booking to paid only if
       last_payment_applied_at IS NULL
       OR last_payment_applied_at < occurredAt
  4. Older event is stored but not applied → { outOfOrder: true }
```

The booking stays `pending` until a new, in-order settlement arrives.

### Hold sweeper

Holds expire after ten minutes. The sweeper runs every 10 seconds and claims a batch of up to 100 overdue active holds with `FOR UPDATE SKIP LOCKED`, so two workers cannot expire the same row.

Expired `hold_seats` drop `locked_seat_id`, which releases the seat.

### Transactional outbox

The confirmation transaction writes the booking and the `booking.confirmed` outbox row together. The API never publishes to RabbitMQ inside that transaction. That avoids “booking saved, message lost” and “message sent, booking rolled back.”

The outbox publisher, every second:

1. Selects unpublished rows with `FOR UPDATE SKIP LOCKED`.
2. Publishes each envelope to the `seat-booking.events` topic exchange with routing key `booking.confirmed`.
3. Waits for RabbitMQ publisher confirms.
4. Sets `outbox.published_at`.

### Notification consumer

```text
outbox row
  ▼
outbox publisher  ──confirm──►  RabbitMQ topic exchange
                                  │
                                  ├─ seat-booking.notifications
                                  ├─ retry queues (1 min, 5 min)
                                  └─ seat-booking.notifications.dlq
                                  │
                                  ▼
                         notification-service
                                  │
                                  ├─ skip if notification_deliveries already sent
                                  ├─ send email via SMTP
                                  └─ on failure: retry, then dead-letter
                                  ▼
                               MailHog
```

The consumer records `outbox.id` in `notification_deliveries`. A redelivered message that is already `sent` is acknowledged without a second email.

## Sync vs async at a glance

| Concern | Mode | Why |
| --- | --- | --- |
| Browse events and seats | Sync HTTP | The client needs the current catalog immediately |
| Create hold | Sync HTTP + DB transaction | The seat must be reserved before the response returns |
| Confirm hold | Sync HTTP + sync authorize + sync DB | Money intent and booking must both exist, or neither |
| Void authorization | Sync compensation | Confirmation already failed; the client is still waiting |
| Expire holds | Async job | Time-based cleanup should not sit on a user request |
| Publish booking events | Async outbox | RabbitMQ must not join the booking transaction |
| Email the customer | Async consumer | SMTP latency and retries must not block booking |
| Mark booking paid | Async webhook | The provider settles later, not during confirm |

## Tech stack

### Runtime and language

| Choice | Role |
| --- | --- |
| Node.js 20+ | Single runtime for HTTP and background jobs |
| TypeScript 5.9, ESM | Compile-time types; `.js` extensions for NodeNext |
| pnpm workspaces | Services and shared packages in one repo |
| tsx | Run TypeScript in development without a separate compile step |

Node is a good fit because the booking path is I/O bound: HTTP, PostgreSQL, and a payment API. TypeScript keeps the HTTP contracts, SQL row shapes, and RabbitMQ envelopes aligned. Workspaces keep error types and message schemas in one place so the API and notification service cannot drift.

### Synchronous stack

| Choice | Role | Why this instead of alternatives |
| --- | --- | --- |
| Express 5 | HTTP framework | Small surface, middleware pipeline, native async error forwarding |
| Zod 4 | Request and env validation | Runtime checks that produce the same types the services use |
| `pg` | PostgreSQL client | Direct control of transactions, advisory locks, and `SKIP LOCKED` |
| PostgreSQL 16 | System of record | Generated columns, partial indexes, row locks, unique constraints |
| Ports and adapters for payments | `PaymentProvider` | Confirm talks to a port; the HTTP adapter uses `PAYMENT_PROVIDER_API_URL` so the PSP can change without changing confirm logic |

The server uses `pg` rather than an ORM because confirmation depends on exact SQL: `pg_advisory_lock`, `SELECT … FOR UPDATE`, generated `locked_seat_id`, and a single transaction that writes bookings and outbox together. An ORM would hide those primitives.

Zod is used at the HTTP boundary and at process start (`shared/config.ts`). Invalid environment variables fail immediately instead of failing on the first request.

### Asynchronous stack

| Choice | Role | Why this instead of alternatives |
| --- | --- | --- |
| Transactional outbox | Reliable events | Publishing inside the DB transaction is not atomic with RabbitMQ |
| RabbitMQ 3.13 topic exchange | Service-to-service messages | Routing keys, durable queues, delayed retry via TTL queues, DLQ |
| amqplib + publisher confirms | Publish path | A row is marked published only after the broker confirms |
| Separate notification service | Email delivery | Isolates SMTP retries from the booking latency path |
| MailHog | Local email sink | Inspect mail without a real mailbox |
| `PAYMENT_PROVIDER_API_URL` / `PUBLIC_WEBHOOK_URL` | Dev payment + webhook | Authorize against a configured provider URL; settle later via the public callback URL |

Polling PostgreSQL from the notification service would couple email to the booking schema and lose retry topology. Publishing directly from `confirmHold` would lose events if RabbitMQ was down after commit, or create ghost bookings if publish succeeded and the transaction rolled back.

### Observability and shared libraries

| Package | Role |
| --- | --- |
| `@seat-booking/errors` | Domain errors mapped to HTTP status |
| `@seat-booking/http` | Request IDs and idempotency-key middleware |
| `@seat-booking/observability` | JSON logs bound to request context via `AsyncLocalStorage` |
| `@seat-booking/messaging` | Exchange/queue topology and `booking.confirmed` envelope |

Logs are structured JSON (`request.started`, `request.completed`, `request.failed`) with duration and request ID. That is enough to follow one confirmation from HTTP through SQL and, later, through the outbox and consumer.

### Development-only pieces

MailHog and a mock payment URL are not production dependencies. A production payment adapter must verify webhook signatures and implement a real authorize/void API. A production notifier would use a real SMTP or email provider.

`bcryptjs` and `jsonwebtoken` are listed in the server package but are not used on the request path. Clients currently supply `userId` on hold creation; `fakeAuth` exists but is not registered in `app.ts`.

## Invariants the architecture protects

- **One active or confirmed hold per seat.** Application check plus unique `locked_seat_id`.
- **The server owns money.** Amounts come from stored seat prices, not the client.
- **Authorize, then persist.** A booking row is written only after the provider accepts an intent for that booking ID.
- **Compensate on failure.** A failed confirmation voids the authorization.
- **Idempotent confirm.** The same `Idempotency-Key` returns the stored booking; a different hold with that key is a conflict.
- **Idempotent settlement.** `provider_event_id` is unique. Older events cannot overwrite a newer applied payment.
- **At-least-once notifications, at-most-once email.** Outbox plus `notification_deliveries` prevents duplicate sends.
- **Holds are temporary.** The sweeper releases expired seats without a client call.

## End-to-end booking path

```text
1.  POST /users
2.  GET  /events  →  GET /events/:id/seats
3.  POST /events/:id/holds                         sync: lock seats
4.  POST /holds/:id/confirm + Idempotency-Key
       authorize payment                           sync: HTTP to provider
       write booking + outbox                      sync: PostgreSQL
       return pending booking                      sync: HTTP 201
5.  Provider POST /payments/payment-status         async: mark paid
6.  Outbox publisher → RabbitMQ                    async: after commit
7.  Notification service → MailHog                 async: email
```

Steps 1–4 are the user-facing, synchronous conversation. Steps 5–7 complete the booking after the client already has a pending reservation.
