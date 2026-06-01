import { redirect } from "next/navigation";

export default async function RootPage() {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    let needsSetup = false;

    if (tursoUrl && tursoToken) {
      const { createClient } = await import("@libsql/client");
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      const result = await client.execute(
        'SELECT id FROM User WHERE role = "SUPERADMIN" LIMIT 1'
      );
      needsSetup = result.rows.length === 0;
    } else {
      const { db } = await import("@lib/db");
      const superadmin = await db.user.findFirst({
        where: { role: "SUPERADMIN" },
      });
      needsSetup = !superadmin;
    }

    if (needsSetup) {
      redirect("/setup");
    }

    redirect("/login");
  } catch (error) {
    console.error("[RootPage] Error:", error);
    redirect("/setup");
  }
}
