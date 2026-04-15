export class CookieManager {
  static getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmedCookie = cookie.trim();
      const [cookieName, ...valueParts] = trimmedCookie.split('=');
      const value = valueParts.join('=');
      if (cookieName === name) {
        return value ? decodeURIComponent(value) : null;
      }
    }
    return null;
  }

  static setCookie(name: string, value: string, days = 1): void {
    if (typeof document === 'undefined') return;

    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires.toUTCString()}; SameSite=Strict`;
  }

  static deleteCookie(name: string): void {
    if (typeof document === 'undefined') return;

    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`;
  }

  static hasCookie(name: string): boolean {
    if (typeof document === 'undefined') return false;

    return document.cookie.split(';').some(cookie =>
      cookie.trim().startsWith(`${name}=`)
    );
  }

  static getSessionId(): string | null {
    return this.getCookie('session_id');
  }

  static setSessionId(sessionId: string, days = 1): void {
    this.setCookie('session_id', sessionId, days);
  }

  static clearSessionId(): void {
    this.deleteCookie('session_id');
  }
}
