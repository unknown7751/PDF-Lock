export interface Strength {
  /** 0 (very weak) – 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  hint: string;
}

const COMMON = ["password", "passw0rd", "qwerty", "letmein", "welcome", "admin", "iloveyou", "123456", "abc123", "monkey", "dragon"];

/**
 * Lightweight strength estimate (length + variety + obvious patterns).
 * It is feedback, not a guarantee — real strength comes from length and randomness.
 */
export function estimateStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "Too short", hint: "Enter a password." };
  if (pw.length < 8) return { score: 0, label: "Too short", hint: "Use at least 8 characters." };

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  const unique = new Set(pw).size;
  let bits = Math.log2(Math.max(pool, 2)) * Math.min(pw.length, 40) * (unique / pw.length) ** 0.5;

  const lower = pw.toLowerCase();
  // Anything built on a famous password is guessable no matter how it's decorated.
  if (COMMON.some((c) => lower.includes(c))) bits = Math.min(bits - 20, 28);
  if (/(.)\1{2,}/.test(pw)) bits -= 8;
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(pw)) bits -= 12;

  if (bits < 30) return { score: 1, label: "Weak", hint: "Add more length and mix in different character types." };
  if (bits < 45) return { score: 2, label: "Fair", hint: "Longer is better — try a passphrase of 4+ random words." };
  if (bits < 65) return { score: 3, label: "Good", hint: "Solid. A few more characters would make it excellent." };
  return { score: 4, label: "Strong", hint: "Great password." };
}

const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz", // no l
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", // no I, O
  digit: "23456789", // no 0, 1
  symbol: "!@#$%^&*-_=+?",
};

function randomIndex(max: number): number {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while ((buf[0] as number) >= limit);
  return (buf[0] as number) % max;
}

/** Cryptographically random password containing every character class. */
export function generatePassword(length = 20): string {
  const all = Object.values(SETS).join("");
  const chars = Object.values(SETS).map((set) => set[randomIndex(set.length)] as string);
  while (chars.length < length) chars.push(all[randomIndex(all.length)] as string);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join("");
}
