import { EventEmitter } from "events";

const globalForEvents = globalThis;
const emitter = globalForEvents.__roleRoomsEvents ?? new EventEmitter();
if (!globalForEvents.__roleRoomsEvents) {
  emitter.setMaxListeners(50);
  globalForEvents.__roleRoomsEvents = emitter;
}

export function emitAdminUpdate(payload) {
  emitter.emit("admin:update", payload);
}

export function emitRoundUpdate(payload) {
  emitter.emit("round:update", payload);
}

export function onAdminUpdate(handler) {
  emitter.on("admin:update", handler);
  return () => emitter.off("admin:update", handler);
}

export function onRoundUpdate(handler) {
  emitter.on("round:update", handler);
  return () => emitter.off("round:update", handler);
}
