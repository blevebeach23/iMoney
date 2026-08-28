"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  formDataToObject,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  toFieldErrors,
  type FormState
} from "./validation";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function registerAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createServerSupabaseClient();
  const usernameAvailable = await supabase.rpc("is_username_available", {
    candidate_username: parsed.data.username
  });

  if (usernameAvailable.error) {
    return { ok: false, message: usernameAvailable.error.message };
  }

  if (!usernameAvailable.data) {
    return { ok: false, fieldErrors: { username: ["Username già in uso"] } };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
      data: {
        full_name: parsed.data.fullName,
        username: parsed.data.username
      }
    }
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (data.session) {
    redirect("/onboarding");
  }

  return {
    ok: true,
    message: "Registrazione completata. Controlla l'email se Supabase richiede conferma."
  };
}

export async function loginAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, message: "Email o password non validi" };
  }

  redirect(String(formData.get("next") || "/"));
}

export async function logoutAction() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/reset-password`
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Se l'email esiste, riceverai il link per reimpostare la password." };
}

export async function resetPasswordAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { ok: false, message: error.message };
  }

  redirect("/");
}

export async function updateProfileAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const usernameAvailable = await supabase.rpc("is_username_available", {
    candidate_username: parsed.data.username
  });

  if (usernameAvailable.error) {
    return { ok: false, message: usernameAvailable.error.message };
  }

  if (!usernameAvailable.data) {
    return { ok: false, fieldErrors: { username: ["Username già in uso"] } };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      username: parsed.data.username,
      phone: parsed.data.phone || null
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Profilo aggiornato" };
}
