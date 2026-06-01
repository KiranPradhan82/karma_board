import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function RootPage() {
  try {
    const session = await getServerSession(authOptions);

    if (session) {
      redirect("/dashboard");
    }

    redirect("/login");
  } catch (error) {
    console.error("[RootPage] Error checking session:", error);
    redirect("/login");
  }
}
