export const ADMIN_USER_ID = '624317230955626507';

export function isAdmin(userId?: string | null): boolean {
  return userId === ADMIN_USER_ID;
}
