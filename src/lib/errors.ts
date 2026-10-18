/** Typed application errors. Messages are safe for logs but not necessarily
 * for end users; the UI maps them to generic messages. */

export class AuthenticationError extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message = "Invalid input") {
    super(message);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  constructor(message = "Too many attempts. Try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}
