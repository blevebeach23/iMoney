import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/auth/profile-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, username, phone")
    .eq("id", user.id)
    .single();

  if (error) {
    throw error;
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Impostazioni</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Profilo</h1>
      </header>
      <ProfileForm fullName={profile.full_name} username={profile.username} phone={profile.phone} email={user.email ?? ""} />
    </main>
  );
}
