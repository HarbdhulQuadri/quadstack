import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@quadstack/auth";

export default async function DashboardPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session.user.name}.
      </p>
    </main>
  );
}
