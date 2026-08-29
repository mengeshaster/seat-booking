import { z } from "zod";

const nullableText = z.string().trim().min(1).max(255).nullable();

export const userIdParamsSchema = z.object({
    id: z.uuid()
});

export const createUserBodySchema = z.object({
    email: z.email().trim().toLowerCase(),
    fullName: z.string().trim().min(1).max(255),
    phone: nullableText.optional(),
    addressLine1: nullableText.optional(),
    addressLine2: nullableText.optional(),
    city: nullableText.optional(),
    stateOrProvince: nullableText.optional(),
    postalCode: nullableText.optional(),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional()
});

export const userResponseSchema = z.object({
    id: z.uuid(),
    email: z.email(),
    fullName: z.string(),
    phone: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    stateOrProvince: z.string().nullable(),
    postalCode: z.string().nullable(),
    countryCode: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
