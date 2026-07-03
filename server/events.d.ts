export function emitAdminUpdate(payload: Record<string, unknown>): void;
export function emitRoundUpdate(payload: Record<string, unknown>): void;
export function onAdminUpdate(handler: (payload: Record<string, unknown>) => void): () => void;
export function onRoundUpdate(handler: (payload: Record<string, unknown>) => void): () => void;
