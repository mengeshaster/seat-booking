/**
 * @openapi
 * /holds/{id}:
 *   delete:
 *     tags: [Holds]
 *     summary: Release a hold
 *     parameters:
 *       - $ref: '#/components/parameters/HoldId'
 *     responses:
 *       204:
 *         description: Hold released
 *       404:
 *         description: Hold not found
 *
 * /holds/{id}/confirm:
 *   post:
 *     tags: [Holds]
 *     summary: Confirm an active hold
 *     parameters:
 *       - $ref: '#/components/parameters/HoldId'
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: A stable client-generated key for retrying confirmation.
 *     responses:
 *       204:
 *         description: Hold confirmed
 *       400:
 *         description: Idempotency-Key is missing
 *       409:
 *         description: Hold cannot be confirmed
 *       410:
 *         description: Hold has expired
 */

export {};
