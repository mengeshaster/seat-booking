import type { PoolClient } from "pg";
import { config } from "../src/shared/config.js";
import { connectDatabase, disconnectDatabase, withTransaction } from "../src/shared/db.js";

const USER_COUNT = 100;
const EVENT_COUNT = 20;
const ROWS_PER_EVENT = 20;
const SEATS_PER_ROW = 10;

function stableUuid(value: number): string {
    return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function insertValues(
    client: PoolClient,
    table: string,
    columns: string[],
    rows: unknown[][]
): Promise<void> {
    const values = rows.flat();
    const placeholders = rows
        .map((row, rowIndex) => {
            const offset = rowIndex * columns.length;
            return `(${row.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
        })
        .join(", ");

    return client
        .query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`, values)
        .then(() => undefined);
}

async function seed(client: PoolClient): Promise<void> {
    await client.query(`
        TRUNCATE TABLE
            payment_events,
            outbox,
            bookings,
            hold_seats,
            holds,
            seats,
            events,
            users
        RESTART IDENTITY CASCADE
    `);

    const users = Array.from({ length: USER_COUNT }, (_, index) => [
        stableUuid(10_000 + index),
        `dev.user${String(index + 1).padStart(3, "0")}@example.test`,
        `Development User ${index + 1}`,
        `+155500${String(index + 1).padStart(4, "0")}`,
        `${index + 1} Example Street`,
        null,
        "Seat City",
        "Development State",
        `100${String(index).padStart(2, "0")}`,
        "US"
    ]);
    await insertValues(
        client,
        "users",
        [
            "id",
            "email",
            "full_name",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state_or_province",
            "postal_code",
            "country_code"
        ],
        users
    );

    const now = new Date();
    const events = Array.from({ length: EVENT_COUNT }, (_, index) => [
        stableUuid(20_000 + index),
        `Development Event ${String(index + 1).padStart(2, "0")}`,
        new Date(now.getTime() + (index + 1) * 86_400_000)
    ]);
    await insertValues(client, "events", ["id", "name", "starts_at"], events);

    const seats: unknown[][] = [];
    for (let eventIndex = 0; eventIndex < EVENT_COUNT; eventIndex += 1) {
        for (let rowIndex = 0; rowIndex < ROWS_PER_EVENT; rowIndex += 1) {
            for (let seatIndex = 0; seatIndex < SEATS_PER_ROW; seatIndex += 1) {
                const absoluteSeatIndex =
                    eventIndex * ROWS_PER_EVENT * SEATS_PER_ROW + rowIndex * SEATS_PER_ROW + seatIndex;
                seats.push([
                    stableUuid(30_000 + absoluteSeatIndex),
                    events[eventIndex][0],
                    String.fromCharCode(65 + rowIndex),
                    seatIndex + 1,
                    2_500 + rowIndex * 100 + seatIndex * 25
                ]);
            }
        }
    }
    await insertValues(
        client,
        "seats",
        ["id", "event_id", "row_label", "seat_number", "price_cents"],
        seats
    );

    const activeHolds = Array.from({ length: 5 }, (_, index) => [
        stableUuid(70_000 + index),
        events[0][0],
        users[index][0],
        "active",
        new Date(now.getTime() + 15 * 60_000)
    ]);
    const confirmedHolds = Array.from({ length: 10 }, (_, index) => [
        stableUuid(71_000 + index),
        events[1][0],
        users[10 + index][0],
        "confirmed",
        new Date(now.getTime() + 60 * 60_000)
    ]);
    await insertValues(
        client,
        "holds",
        ["id", "event_id", "user_id", "status", "expires_at"],
        [...activeHolds, ...confirmedHolds]
    );

    const holdSeats: unknown[][] = [
        ...activeHolds.map((hold, index) => [
            hold[0],
            stableUuid(30_000 + index),
            "active"
        ]),
        ...confirmedHolds.map((hold, index) => [
            hold[0],
            stableUuid(30_000 + ROWS_PER_EVENT * SEATS_PER_ROW + index),
            "confirmed"
        ])
    ];
    await insertValues(client, "hold_seats", ["hold_id", "seat_id", "hold_status"], holdSeats);

    const bookings = confirmedHolds.map((hold, index) => {
        const bookingId = stableUuid(80_000 + index);
        const status = index < 5 ? "paid" : "pending";
        return [
            bookingId,
            hold[0],
            hold[2],
            2_500 + index * 25,
            status,
            `development-booking-${index + 1}`,
            JSON.stringify({
                id: bookingId,
                holdId: hold[0],
                userId: hold[2],
                amountCents: 2_500 + index * 25,
                status
            })
        ];
    });
    await insertValues(
        client,
        "bookings",
        [
            "id",
            "hold_id",
            "user_id",
            "amount_cents",
            "status",
            "idempotency_key",
            "response_body"
        ],
        bookings
    );

    const paymentEvents = bookings.slice(0, 5).map((booking, index) => [
        `development-payment-event-${index + 1}`,
        booking[0],
        new Date(now.getTime() - (index + 1) * 60_000),
        JSON.stringify({
            status: "success",
            paymentId: `development-payment-${index + 1}`
        })
    ]);
    await insertValues(
        client,
        "payment_events",
        ["provider_event_id", "booking_id", "occurred_at", "payload"],
        paymentEvents
    );

    const outboxRows = bookings.map((booking, index) => [
        booking[0],
        "booking.confirmed",
        JSON.stringify({
            version: 1,
            booking: {
                id: booking[0],
                holdId: booking[1],
                userId: booking[2],
                amountCents: booking[3],
                status: booking[4]
            },
            recipient: {
                email: users[10 + index][1],
                fullName: users[10 + index][2]
            },
            event: {
                id: events[1][0],
                name: events[1][1],
                startsAt: (events[1][2] as Date).toISOString()
            },
            seats: [
                {
                    id: stableUuid(30_000 + ROWS_PER_EVENT * SEATS_PER_ROW + index),
                    rowLabel: "A",
                    seatNumber: index + 1
                }
            ]
        }),
        now
    ]);
    await insertValues(
        client,
        "outbox",
        ["aggregate_id", "event_type", "payload", "published_at"],
        outboxRows
    );
}

async function run(): Promise<void> {
    if (config.nodeEnv !== "development") {
        throw new Error("The development seed command only runs when NODE_ENV=development");
    }

    await connectDatabase();

    try {
        await withTransaction(seed);
        console.log(
            `Seeded ${USER_COUNT} users, ${EVENT_COUNT} events, and ${
                EVENT_COUNT * ROWS_PER_EVENT * SEATS_PER_ROW
            } seats.`
        );
    } finally {
        await disconnectDatabase();
    }
}

run().catch((error) => {
    console.error("Development seed failed", error);
    process.exitCode = 1;
});
