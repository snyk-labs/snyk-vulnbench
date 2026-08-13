import { HttpErrorResponse } from '@angular/common/http';

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof HttpErrorResponse) {
    const msg = err.error?.message;
    return Array.isArray(msg) ? msg[0] : msg || fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}
