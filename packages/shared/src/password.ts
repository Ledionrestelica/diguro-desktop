/** Password rule shared by the sign-up / reset forms and the API hook that
 *  enforces it, so the hint users see is exactly what the server checks. */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RULE_MESSAGE =
  'Password must contain at least 8 characters, a symbol and a number.';

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /\d/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password)
  );
}
