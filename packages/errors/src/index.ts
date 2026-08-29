export class ConflictError extends Error {
    readonly name = "ConflictError";
    readonly resource?: string;

    constructor(message = "Conflict detected", resource?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.resource = resource;
    }
}

export class GoneError extends Error {
    readonly name = "GoneError";
    readonly resource?: string;

    constructor(message = "Resource no longer available or hold expired", resource?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.resource = resource;
    }
}

export class ValidationError extends Error {
    readonly name = "ValidationError";
    readonly errors?: unknown;
    readonly resource?: string;

    constructor(message = "Validation failed", errors?: unknown, resource?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.errors = errors;
        this.resource = resource;
    }
}

export class NotFoundError extends Error {
    readonly name = "NotFoundError";
    readonly resource?: string;

    constructor(message = "Resource not found", resource?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.resource = resource;
    }
}
