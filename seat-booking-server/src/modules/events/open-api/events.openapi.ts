/**
 * @openapi
 * /events:
 *   get:
 *     tags: [Events]
 *     summary: List events
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: A page of events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [events, nextCursor]
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 nextCursor:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *       500:
 *         description: Internal server error
 *
 * /events/{id}:
 *   get:
 *     tags: [Events]
 *     summary: Get an event
 *     parameters:
 *       - $ref: '#/components/parameters/EventId'
 *     responses:
 *       200:
 *         description: Event found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Event not found
 *
 * /events/{id}/seats:
 *   get:
 *     tags: [Events]
 *     summary: List an event's seats
 *     parameters:
 *       - $ref: '#/components/parameters/EventId'
 *     responses:
 *       200:
 *         description: Seats for the event
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [eventId, seats]
 *               properties:
 *                 eventId:
 *                   type: string
 *                   format: uuid
 *                 seats:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Seat'
 *       500:
 *         description: Internal server error
 */
/**
 * @openapi
 * /events/{id}/holds:
 *   post:
 *     tags: [Events]
 *     summary: Create a hold for an event
 *     parameters:
 *       - $ref: '#/components/parameters/EventId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, seatIds]
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               seatIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 uniqueItems: true
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       201:
 *         description: Hold created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Hold'
 *       500:
 *         description: Internal server error
 */

export { };

