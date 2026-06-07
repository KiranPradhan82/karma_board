import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

// Wrap handlers to catch unhandled errors on Vercel serverless
async function safeHandler(
  req: Request,
  ctx: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    return await handler(req, ctx);
  } catch (error) {
    console.error("[NextAuth] Unhandled error:", error);
    // Return a proper JSON error instead of letting Vercel return a generic 500
    return new Response(
      JSON.stringify({ error: "Authentication service temporarily unavailable. Please try again." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

export { safeHandler as GET, safeHandler as POST };
