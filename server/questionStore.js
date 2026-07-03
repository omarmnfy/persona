const activeByRoom = new Map();
const timersByRoom = new Map();
const locksByRoom = new Map();

export function acquireQuestionLock(roomId) {
  if (locksByRoom.get(roomId)) return false;
  locksByRoom.set(roomId, true);
  return true;
}

export function releaseQuestionLock(roomId) {
  locksByRoom.delete(roomId);
}

function clearTimer(roomId) {
  const timer = timersByRoom.get(roomId);
  if (!timer) return;
  clearTimeout(timer);
  timersByRoom.delete(roomId);
}

export function setActiveQuestion({ roomId, question }) {
  activeByRoom.set(roomId, question);
}

const GRACE_MS = 1500;

export function getActiveQuestion(roomId) {
  const question = activeByRoom.get(roomId);
  if (!question) return null;
  if (question.endsAt.getTime() + GRACE_MS <= Date.now()) {
    activeByRoom.delete(roomId);
    clearTimer(roomId);
    return null;
  }
  return question;
}

export function clearActiveQuestion(roomId) {
  activeByRoom.delete(roomId);
  clearTimer(roomId);
}

export function setQuestionTimer(roomId, timer) {
  clearTimer(roomId);
  timersByRoom.set(roomId, timer);
}

export function markQuestionAnswered(roomId, userId) {
  const question = getActiveQuestion(roomId);
  if (!question) return;
  question.answeredUserIds.add(userId);
  activeByRoom.set(roomId, question);
}

export function clearQuestionTimer(roomId) {
  clearTimer(roomId);
}

export function hasAnsweredQuestion(roomId, userId) {
  const question = getActiveQuestion(roomId);
  if (!question) return false;
  return question.answeredUserIds.has(userId);
}
