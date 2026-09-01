export function familyTitle(householdName: string) {
  const normalizedName = householdName.trim() || "Famiglia";

  if (/^famiglia\b/i.test(normalizedName)) {
    return normalizedName.replace(/^famiglia\b/i, "Famiglia");
  }

  return `Famiglia ${normalizedName}`;
}
