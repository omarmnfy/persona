export type PasswordStrength = "weak" | "moderate" | "strong";

export function evaluatePassword(password: string) {
  const lengthOk = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const score = [lengthOk, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

  let strength: PasswordStrength = "weak";
  if (score >= 4) strength = "strong";
  else if (score >= 3) strength = "moderate";

  return {
    lengthOk,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    score,
    strength
  };
}

export function validatePassword(password: string) {
  const result = evaluatePassword(password);
  const valid =
    result.lengthOk &&
    result.hasUpper &&
    result.hasLower &&
    result.hasNumber &&
    result.hasSpecial;

  return { valid, result };
}
