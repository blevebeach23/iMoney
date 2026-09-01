"use client";

import { Send, Save, Trash2 } from "lucide-react";
import { useFormState } from "react-dom";
import { BudgetManager } from "@/components/budgets/budget-manager";
import { FormMessage, PendingButton, TextField } from "@/components/master-data/field-controls";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/validation";
import { householdInviteStatusLabel, householdMemberStatusLabel } from "@/lib/households/status-labels";
import { isHouseholdAdminRole, shouldShowPromoteToAdmin, sortHouseholdMembersForDisplay } from "@/lib/households/member-ui";
import {
  cancelHouseholdInviteAction,
  inviteHouseholdMemberAction,
  leaveHouseholdAction,
  removeHouseholdMemberAction,
  saveHouseholdAction,
  updateHouseholdMemberRoleAction,
  updateHouseholdPreferenceAction
} from "@/lib/households/actions";
import type { BudgetReport } from "@/lib/calculations/budget";
import type { BudgetListItem } from "@/services/budgets/budget-service";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { ActiveHouseholdOption, HouseholdInviteListItem, HouseholdMemberListItem } from "@/services/households/household-service";
import type { Household } from "@/types/domain";

const initialState: FormState = { ok: false };

export function FamilySettings({
  activeHouseholds,
  budgets,
  budgetReport,
  categoryTree,
  household,
  invites,
  members,
  monthStart,
  previousMonthStart,
  preference,
  currentUserId
}: Readonly<{
  activeHouseholds: ActiveHouseholdOption[];
  budgets: BudgetListItem[];
  budgetReport: BudgetReport;
  categoryTree: CategoryTreeItem[];
  household: Household | null;
  invites: HouseholdInviteListItem[];
  members: HouseholdMemberListItem[];
  monthStart: string;
  previousMonthStart: string;
  preference: { shareNewMovementsByDefault: boolean } | null;
  currentUserId: string;
}>) {
  const [householdState, householdAction] = useFormState(saveHouseholdAction, initialState);
  const [inviteState, inviteAction] = useFormState(inviteHouseholdMemberAction, initialState);
  const [leaveState, leaveAction] = useFormState(leaveHouseholdAction, initialState);
  const currentMember = members.find((member) => member.userId === currentUserId);
  const currentUserRole = currentMember?.role ?? null;
  const orderedMembers = sortHouseholdMembersForDisplay(members, currentUserId);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Famiglia</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Impostazioni famiglia</h1>
      </header>

      <section className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
        <h2 className="text-lg font-semibold text-foreground">{household ? "Nome famiglia" : "Crea famiglia"}</h2>
        <form action={householdAction} className="space-y-4">
          <FormMessage state={householdState} />
          {household?.id && <input type="hidden" name="id" value={household.id} />}
          <TextField label="Nome famiglia" name="name" defaultValue={household?.name ?? ""} errors={householdState.fieldErrors} />
          <PendingButton>
            <Save aria-hidden className="h-4 w-4" />
            Salva famiglia
          </PendingButton>
        </form>
      </section>

      {household && (
        <div className="mt-6 space-y-6">
          <section className="space-y-3 rounded-md border border-border bg-white p-4 shadow-panel">
            <h2 className="text-lg font-semibold text-foreground">Preferenze personali</h2>
            <form action={updateHouseholdPreferenceAction}>
              <input type="hidden" name="householdId" value={household.id} />
              <label className="flex min-h-12 items-center gap-3">
                <input name="shareNewMovementsByDefault" type="checkbox" defaultChecked={Boolean(preference?.shareNewMovementsByDefault)} className="h-5 w-5" />
                <span className="text-sm font-semibold">Condividi nuovi movimenti di default</span>
              </label>
              <Button type="submit" variant="secondary" className="mt-3 w-full">
                Salva preferenza
              </Button>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Membri</h2>
            <FormMessage state={leaveState} />
            {orderedMembers.map((member) => {
              const isCurrentUser = member.userId === currentUserId;
              const canManageMember = !isCurrentUser && isHouseholdAdminRole(currentUserRole ?? "member");
              const showPromote = shouldShowPromoteToAdmin(currentUserRole, currentUserId, member);

              return (
              <article key={member.userId} className="rounded-md border border-border bg-white p-4 shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{member.fullName}</p>
                    {member.username && <p className="text-sm text-zinc-600">{member.username}</p>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{householdMemberStatusLabel(member.status)}</span>
                    {isHouseholdAdminRole(member.role) && <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Admin</span>}
                  </div>
                </div>
                {isCurrentUser ? (
                  <form action={leaveAction} className="mt-3">
                    <input type="hidden" name="householdId" value={household.id} />
                    <Button type="submit" variant="secondary" className="w-full">
                      Interrompi condivisione
                    </Button>
                  </form>
                ) : (
                  canManageMember && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {showPromote ? (
                        <form action={updateHouseholdMemberRoleAction}>
                          <input type="hidden" name="householdId" value={household.id} />
                          <input type="hidden" name="userId" value={member.userId} />
                          <input type="hidden" name="role" value="admin" />
                          <Button type="submit" variant="secondary" className="w-full">
                            Rendi admin
                          </Button>
                        </form>
                      ) : (
                        <div />
                      )}
                      <form action={removeHouseholdMemberAction}>
                        <input type="hidden" name="householdId" value={household.id} />
                        <input type="hidden" name="userId" value={member.userId} />
                        <Button type="submit" variant="ghost" className="w-full text-red-700">
                          <Trash2 aria-hidden className="h-4 w-4" />
                          Rimuovi
                        </Button>
                      </form>
                    </div>
                  )
                )}
              </article>
              );
            })}
          </section>

          <section className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
            <h2 className="text-lg font-semibold text-foreground">Invita membro</h2>
            <form action={inviteAction} className="space-y-4">
              <FormMessage state={inviteState} />
              <input type="hidden" name="householdId" value={household.id} />
              <TextField label="Email" name="email" type="email" errors={inviteState.fieldErrors} />
              <PendingButton>
                <Send aria-hidden className="h-4 w-4" />
                Crea invito
              </PendingButton>
            </form>
            {inviteState.ok && inviteState.message && <p className="text-sm font-semibold text-primary">{inviteState.message}</p>}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Inviti</h2>
            {invites.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun invito.</p>
            ) : (
              invites.map((invite) => (
                <article key={invite.id} className="rounded-md border border-border bg-white p-4 shadow-panel">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{invite.email}</p>
                      <p className="mt-1 text-sm text-zinc-600">{householdInviteStatusLabel(invite.status)}</p>
                    </div>
                    {invite.status === "PENDING" && isHouseholdAdminRole(currentUserRole ?? "member") && (
                      <form action={cancelHouseholdInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button type="submit" variant="ghost" className="text-red-700">
                          Cancella invito
                        </Button>
                      </form>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Budget famiglia</h2>
            <BudgetManager budgets={budgets} categoryTree={categoryTree} householdId={household.id} monthStart={monthStart} previousMonthStart={previousMonthStart} report={budgetReport} />
          </section>
        </div>
      )}

      {activeHouseholds.length > 1 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Altre famiglie</h2>
          {activeHouseholds.map((item) => (
            <a key={item.id} href={`/family/settings?householdId=${item.id}`} className="block rounded-md border border-border bg-white p-4 font-semibold">
              {item.name}
            </a>
          ))}
        </section>
      )}
    </main>
  );
}
