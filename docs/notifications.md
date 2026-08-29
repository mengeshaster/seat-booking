# Booking notifications

The notification service consumes `booking.confirmed` events from RabbitMQ and sends email through MailHog.

## Setup

Start the local dependencies and apply both services' migrations:

```bash
make db
make migrate
make notification-migrate
```

Create the notification-service environment file:

```bash
cp notification-service/.env.example notification-service/.env
```

Then run both services:

```bash
pnpm --dir seat-booking-server dev:start-server
pnpm --dir notification-service dev
```

On PowerShell, replace `cp` with `Copy-Item`.

## Verify delivery

Confirming a booking writes a `booking.confirmed` outbox event. The booking API's outbox publisher sends it to the `seat-booking.events` topic exchange. The notification service consumes the event and sends an email through MailHog.

Open `http://localhost:8025` to inspect the message.

## Delivery guarantees

The consumer records each outbox message ID in `notification_deliveries`. A redelivered message already marked `sent` is acknowledged without sending another email.

Failed deliveries retry after one minute and five minutes. Messages that continue to fail are routed to `seat-booking.notifications.dlq`.
