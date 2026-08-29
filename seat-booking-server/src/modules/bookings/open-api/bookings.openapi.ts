/**
 * @openapi
 * /bookings/{id}/seats:
 *   get:
 *     tags: [Bookings]
 *     summary: Get a booking by ID
 *     parameters:
 *       - $ref: '#/components/parameters/BookingId'
 *     responses:
 *       200:
 *         description: Booking found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *
 * /bookings/{idempotencyKey}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get a booking by idempotency key
 *     parameters:
 *       - in: path
 *         name: idempotencyKey
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *
 * /bookings/{id}/status:
 *   put:
 *     tags: [Bookings]
 *     summary: Update a booking status
 *     parameters:
 *       - $ref: '#/components/parameters/BookingId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, paid, failed]
 *     responses:
 *       200:
 *         description: Updated booking
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *
 * /bookings/{id}:
 *   delete:
 *     tags: [Bookings]
 *     summary: Delete a booking
 *     parameters:
 *       - $ref: '#/components/parameters/BookingId'
 *     responses:
 *       204:
 *         description: Booking deleted
 *       404:
 *         description: Booking not found
 */

export {};
