export function errorMessage(err: unknown): string | null {
  if (err instanceof Error) {
    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
    return null;
  }

  if (err !== null && typeof err === 'object' && 'message' in err) {
    const msg = err.message;
    if (typeof msg === 'string' && msg.length > 0) {
      return msg;
    }
  }

  return null;
}
