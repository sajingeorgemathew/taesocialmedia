/** Someone else saved the post after the caller loaded it. */
export class ConflictError extends Error {
  constructor(message = 'This post was changed by another team member since you opened it.') {
    super(message)
    this.name = 'ConflictError'
  }
}

/** The post was deleted (possibly by another team member). */
export class NotFoundError extends Error {
  constructor(message = 'This post no longer exists. It may have been deleted by another team member.') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** A user-facing message for any error thrown by a repository. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
