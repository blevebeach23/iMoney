export function AuthCard({
  title,
  subtitle,
  children
}: Readonly<{ title: string; subtitle?: string; children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">iMoney</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">{title}</h1>
        {subtitle && <p className="mt-2 text-base leading-6 text-zinc-600">{subtitle}</p>}
      </div>
      {children}
    </main>
  );
}
