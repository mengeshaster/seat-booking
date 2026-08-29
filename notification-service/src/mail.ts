import nodemailer from "nodemailer";
import type { BookingConfirmedPayload } from "@seat-booking/messaging";
import { config } from "./config.js";

const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false
});

export async function sendBookingConfirmation(payload: BookingConfirmedPayload): Promise<void> {
    const seatList = payload.seats
        .map((seat) => `${seat.rowLabel}${seat.seatNumber}`)
        .join(", ");

    await transporter.sendMail({
        from: config.smtpFrom,
        to: payload.recipient.email,
        subject: `Booking confirmed for ${payload.event.name}`,
        text: [
            `Hello ${payload.recipient.fullName},`,
            "",
            `Your booking ${payload.booking.id} is confirmed.`,
            `Event: ${payload.event.name}`,
            `Starts: ${payload.event.startsAt}`,
            `Seats: ${seatList}`,
            `Total: ${(payload.booking.amountCents / 100).toFixed(2)}`,
            "",
            "Thank you for booking with us."
        ].join("\n")
    });
}
