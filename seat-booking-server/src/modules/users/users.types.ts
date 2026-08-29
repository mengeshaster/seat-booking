import type { CreateUserBody } from "./users.schema.js";

export type User = {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    stateOrProvince: string | null;
    postalCode: string | null;
    countryCode: string | null;
    createdAt: string;
    updatedAt: string;
};

export interface UsersRepository {
    create(input: CreateUserBody): Promise<User>;
    findById(id: string): Promise<User | null>;
}
