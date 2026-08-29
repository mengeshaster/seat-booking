import { pool } from "../../shared/db.js";
import type { CreateUserBody } from "./users.schema.js";
import type { User, UsersRepository } from "./users.types.js";

type UserRow = Omit<User, "createdAt" | "updatedAt"> & {
    createdAt: Date;
    updatedAt: Date;
};

function toUser(row: UserRow): User {
    return {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
    };
}

export const usersRepository: UsersRepository = {
    async create(input: CreateUserBody): Promise<User> {
        const result = await pool.query<UserRow>(
            `
                INSERT INTO users (
                    email, full_name, phone, address_line_1, address_line_2,
                    city, state_or_province, postal_code, country_code
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING
                    id,
                    email,
                    full_name AS "fullName",
                    phone,
                    address_line_1 AS "addressLine1",
                    address_line_2 AS "addressLine2",
                    city,
                    state_or_province AS "stateOrProvince",
                    postal_code AS "postalCode",
                    country_code AS "countryCode",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
            `,
            [
                input.email,
                input.fullName,
                input.phone ?? null,
                input.addressLine1 ?? null,
                input.addressLine2 ?? null,
                input.city ?? null,
                input.stateOrProvince ?? null,
                input.postalCode ?? null,
                input.countryCode ?? null
            ]
        );

        return toUser(result.rows[0]);
    },

    async findById(id: string): Promise<User | null> {
        const result = await pool.query<UserRow>(
            `
                SELECT
                    id,
                    email,
                    full_name AS "fullName",
                    phone,
                    address_line_1 AS "addressLine1",
                    address_line_2 AS "addressLine2",
                    city,
                    state_or_province AS "stateOrProvince",
                    postal_code AS "postalCode",
                    country_code AS "countryCode",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                FROM users
                WHERE id = $1
            `,
            [id]
        );

        return result.rows[0] ? toUser(result.rows[0]) : null;
    }
};
