import { DashboardPreview } from "@/components/dashboard/dashboard-preview";
import { logoutAction } from "@/lib/auth/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <>
      <form action={logoutAction} className="mx-auto max-w-md px-4 pt-4">
        <button type="submit" className="text-sm font-semibold text-primary">
          Esci
        </button>
      </form>
      <DashboardPreview />
    </>
  );
}
