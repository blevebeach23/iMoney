/** Shared by onboarding and checked against the SQL seed in migration tests. */
export const defaultCategoryGroups = [
  { macro: "ALIMENTARI", categories: ["Colazione", "Pranzo", "Cena", "Dolci", "Supermercato"] },
  { macro: "PROFESSIONE", categories: ["Attività Professionale", "Negozio", "Stipendio"] },
  { macro: "CASA", categories: ["Affitto", "Mutuo", "Manutenzione"] },
  { macro: "AUTO", categories: ["Carburante", "Assicurazione", "Manutenzione"] },
  { macro: "ISTRUZIONE", categories: ["Mensa", "Pulmino", "Asilo", "Scuola", "Libri", "Attività", "Corsi"] },
  { macro: "UTENZE", categories: ["Luce", "Gas", "Telefono"] },
  { macro: "TASSE", categories: ["Tributi e Tasse", "Bolli", "Multe"] },
  { macro: "SALUTE", categories: ["Farmacia", "Visite"] },
  { macro: "TEMPO LIBERO", categories: ["Ristoranti e locali", "Shopping", "Hobby", "Svago", "Cultura", "Sport"] },
  { macro: "REGALI", categories: ["Buste Cerimonie", "Regali Compleanni"] },
  { macro: "FESTE", categories: ["Cerimonie", "Compleanni", "Regali Privati"] },
  { macro: "ENTRATE EXTRA", categories: ["Regali", "Locazioni"] },
  { macro: "VACANZE", categories: ["Viaggi", "Alloggi"] },
  { macro: "ALTRO", categories: ["Baby Sitter", "Cura della persona", "Abbonamenti", "Salvadanaio", "Attrezzature", "Varie"] }
] as const;
