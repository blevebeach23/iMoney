import type { HouseholdInviteStatus, HouseholdMemberStatus } from "@/types/domain";

const householdMemberStatusLabels: Record<HouseholdMemberStatus, string> = {
  INVITED: "Invitato",
  ACTIVE: "Attivo",
  REMOVED: "Rimosso"
};

const householdInviteStatusLabels: Record<HouseholdInviteStatus, string> = {
  PENDING: "In attesa",
  ACCEPTED: "Accettato",
  REJECTED: "Rifiutato",
  EXPIRED: "Scaduto"
};

export function householdMemberStatusLabel(status: HouseholdMemberStatus): string {
  return householdMemberStatusLabels[status] ?? status;
}

export function householdInviteStatusLabel(status: HouseholdInviteStatus): string {
  return householdInviteStatusLabels[status] ?? status;
}
