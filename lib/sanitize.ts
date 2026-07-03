export function sanitizeMessage(input: string) {
  return input.trim().slice(0, 2000);
}
