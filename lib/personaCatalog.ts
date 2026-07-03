export const SCHOOL_OPTIONS = [
  "Harvey Mudd College",
  "Claremont McKenna College",
  "Pitzer College",
  "Pomona College",
  "Scripps College",
  "Other"
] as const;

export const PERSONA_NAME_POOL = [
  "Alan Turing",
  "Grace Hopper",
  "John von Neumann",
  "Claude Shannon",
  "Donald Knuth",
  "Edsger Dijkstra",
  "Barbara Liskov",
  "Taher Elgamal",
  "John McCarthy",
  "Frances Allen",
  "Karen Jones",
  "Yaser Abu-Mostafa",
  "Hatim Zaghloul",
  "Al-Kindi",
  "Ibn Rushd",
  "Aristotle",
  "Socrates",
  "René Descartes",
  "David Hume",
  "Immanuel Kant",
  "Friedrich Nietzsche",
  "Karl Marx",
  "Ibn Sina",
  "Michael Gazzaniga",
  "Christof Koch",
  "David Marr",
  "Leon Festinger",
  "Hans Berger",
  "David Heeger",
  "Allen Newell",
  "Jean Piaget",
  "Gordon Bower"
] as const;

export type SchoolOption = (typeof SCHOOL_OPTIONS)[number];

export function isValidSchool(school: string) {
  return SCHOOL_OPTIONS.includes(school as SchoolOption);
}

export function parseFullName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "", realName: "" };
  const [firstName, ...rest] = normalized.split(" ");
  const lastName = rest.join(" ");
  return {
    firstName,
    lastName: lastName || "",
    realName: `${firstName}${lastName ? ` ${lastName}` : ""}`
  };
}
