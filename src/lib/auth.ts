import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/auth-utils";

async function findUserByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
} | null> {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    // Use Turso directly — more reliable than Prisma on serverless
    const { createClient } = await import("@libsql/client");
    // Strip any embedded authToken from URL query string to avoid sending it twice
    const cleanUrl = tursoUrl.split('?')[0];
    const client = createClient({ url: cleanUrl, authToken: tursoToken });
    const result = await client.execute({
      sql: 'SELECT id, name, email, password, role, isActive, mustChangePassword FROM User WHERE email = ?',
      args: [email],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      password: row.password as string,
      role: row.role as string,
      isActive: Boolean(row.isActive),
      mustChangePassword: Boolean(row.mustChangePassword),
    };
  }

  // Fallback to Prisma for local dev
  const { db } = await import("@/lib/db");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: false,
  };
}

async function findClientByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string;
  password: string;
  mustChangePassword: boolean;
} | null> {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    const { createClient } = await import("@libsql/client");
    const cleanUrl = tursoUrl.split('?')[0];
    const client = createClient({ url: cleanUrl, authToken: tursoToken });
    const result = await client.execute({
      sql: 'SELECT id, name, email, password, mustChangePassword FROM Client WHERE email = ? AND status = ?',
      args: [email, 'ACTIVE'],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      password: row.password as string,
      mustChangePassword: Boolean(row.mustChangePassword),
    };
  }

  // Fallback to Prisma for local dev
  const { db } = await import("@/lib/db");
  const client = await db.client.findFirst({ where: { email, status: 'ACTIVE' } });
  if (!client) return null;

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    password: client.password,
    mustChangePassword: client.mustChangePassword,
  };
}

export { findClientByEmail };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log("[Auth] Missing credentials");
            return null;
          }

          console.log("[Auth] Looking up user:", credentials.email);

          // First try User table
          let user = await findUserByEmail(credentials.email);

          if (user) {
            // Team member login
            if (!user.isActive) {
              console.log("[Auth] User inactive:", credentials.email);
              return null;
            }

            const isValid = await verifyPassword(credentials.password, user.password);
            if (!isValid) {
              console.log("[Auth] Password invalid for:", credentials.email);
              return null;
            }

            console.log("[Auth] Login successful (team):", credentials.email, "role:", user.role, "mustChangePassword:", user.mustChangePassword);
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              mustChangePassword: user.mustChangePassword,
              accountType: "team",
            };
          }

          // If not found in User, try Client table
          const client = await findClientByEmail(credentials.email);

          if (client) {
            const isValid = await verifyPassword(credentials.password, client.password);
            if (!isValid) {
              console.log("[Auth] Password invalid for client:", credentials.email);
              return null;
            }

            console.log("[Auth] Login successful (client):", credentials.email, "mustChangePassword:", client.mustChangePassword);
            return {
              id: client.id,
              name: client.name,
              email: client.email,
              role: "CLIENT",
              mustChangePassword: client.mustChangePassword,
              accountType: "client",
            };
          }

          console.log("[Auth] User not found:", credentials.email);
          return null;
        } catch (error) {
          console.error("[Auth] Error during authorization:", error);
          // Return null instead of throwing — prevents "fetch failed" on client.
          // NextAuth will show "Invalid email or password" which is safer than exposing errors.
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role!;
        token.mustChangePassword = (user as unknown as { mustChangePassword?: boolean }).mustChangePassword || false;
        token.accountType = (user as unknown as { accountType?: "team" | "client" }).accountType || "team";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        (session.user as unknown as { mustChangePassword?: boolean }).mustChangePassword = token.mustChangePassword;
        (session.user as unknown as { accountType?: "team" | "client" }).accountType = token.accountType;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
