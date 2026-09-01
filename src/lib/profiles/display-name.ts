export function shortUserName(fullName: unknown, username: unknown) {
  const name = typeof fullName === "string" ? fullName.trim() : "";

  if (name) {
    return name.split(/\s+/)[0] || name;
  }

  const fallback = typeof username === "string" ? username.trim() : "";
  return fallback || "Utente";
}
