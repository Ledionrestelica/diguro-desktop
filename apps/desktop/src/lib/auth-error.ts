/** Error thrown by `apiAuth` calls. `code` is Better-Auth's stable error code
 *  (e.g. `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_PASSWORD`) when it sent one. */
export class AuthRequestError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, code: string | null, status: number) {
    super(message);
    this.name = 'AuthRequestError';
    this.code = code;
    this.status = status;
  }
}

export async function authErrorFromResponse(res: Response): Promise<AuthRequestError> {
  const json: unknown = await res.json().catch(() => null);
  const body = typeof json === 'object' && json !== null ? json : {};
  const code = 'code' in body && typeof body.code === 'string' ? body.code : null;
  const message =
    ('message' in body && typeof body.message === 'string' && body.message) ||
    ('error' in body && typeof body.error === 'string' && body.error) ||
    `Auth request failed (${res.status})`;
  return new AuthRequestError(message, code, res.status);
}

export function isEmailNotVerified(err: unknown): boolean {
  return err instanceof AuthRequestError && err.code === 'EMAIL_NOT_VERIFIED';
}
