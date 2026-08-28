import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, username, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (error) {
    throw error;
  }

  if (profile.onboarding_completed) {
    redirect("/");
  }

  return <OnboardingForm fullName={profile.full_name} username={profile.username} />;
}
