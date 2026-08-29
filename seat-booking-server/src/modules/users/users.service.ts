import { NotFoundError } from "@seat-booking/errors";
import type { CreateUserBody } from "./users.schema.js";
import { usersRepository } from "./users.repository.js";
import type { User } from "./users.types.js";

export function createUser(input: CreateUserBody): Promise<User> {
    return usersRepository.create(input);
}

export async function getUserById(id: string): Promise<User> {
    const user = await usersRepository.findById(id);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    return user;
}
