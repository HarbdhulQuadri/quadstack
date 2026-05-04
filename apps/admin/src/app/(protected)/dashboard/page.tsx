import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@quadstack/auth";

export default async function AdminDashboardPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Signed in as {session.user.email}.
      </p>
    </main>
  );
}
