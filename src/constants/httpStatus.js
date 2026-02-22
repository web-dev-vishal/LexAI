/**
 * HTTP Status Code Constants
 *
 * Centralizes all HTTP status codes used across controllers and middleware.
 * Using named constants prevents magic numbers and makes intent clear.
 * Frozen to prevent accidental mutation at runtime.
 */

// Standard HTTP status codes used by the LexAI API
const HTTP = Object.freeze({
    OK: 200,                  // Successful GET, PATCH, PUT
    CREATED: 201,             // Successful POST (resource created)
    ACCEPTED: 202,            // Request accepted but processing async (e.g., queued analysis)
    NO_CONTENT: 204,          // Successful DELETE with no response body
    BAD_REQUEST: 400,         // Client sent invalid data or missing required fields
    UNAUTHORIZED: 401,        // Missing or invalid authentication token
    FORBIDDEN: 403,           // Authenticated but lacks permission (wrong role/plan)
    NOT_FOUND: 404,           // Resource doesn't exist or is soft-deleted
    CONFLICT: 409,            // Duplicate resource (email already taken, etc.)
    UNPROCESSABLE: 422,       // Valid syntax but semantically incorrect data
    TOO_MANY_REQUESTS: 429,   // Rate limit or quota exceeded
    INTERNAL_ERROR: 500,      // Unhandled server error — should never happen intentionally
    SERVICE_UNAVAILABLE: 503, // Dependency down (MongoDB, Redis, RabbitMQ)
});

export default HTTP;
