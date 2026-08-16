import axios from 'axios';

// Generic messages for common HTTP status codes to avoid leaking internal details.
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'This action conflicts with the current state. Please refresh and try again.',
  422: 'The submitted data is invalid. Please check your input.',
  429: 'Too many requests. Please try again later.',
  500: 'An unexpected error occurred. Please try again.',
  502: 'Service temporarily unavailable. Please try again.',
  503: 'Service temporarily unavailable. Please try again.',
};

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;

    // Use backend error message if it provides a structured error code
    // (these are intentionally user-safe messages from the API)
    if (data && typeof data === 'object' && 'code' in data && 'error' in data) {
      return String(data.error);
    }

    // For errors without a structured code, use generic status-based messages
    if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];

    // Fallback: use backend error string only if it looks safe (no internal details)
    if (data && typeof data === 'object' && 'error' in data) {
      const msg = String(data.error);
      // Allow short, user-facing messages; block verbose internal errors
      if (msg.length <= 200) return msg;
    }

    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}
