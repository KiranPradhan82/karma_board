import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth-utils";

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

          let user;
          try {
            user = await db.user.findUnique({
              where: { email: credentials.email },
            });
          } catch (dbError) {
            console.error("[Auth] DB lookup failed:", dbError);
            // Fallback to direct Turso query
            try {
              const { createClient } = await import("@libsql/client");
              const tursoUrl = process.env.TURSO_DATABASE_URL;
              const tursoToken = process.env.TURSO_AUTH_TOKEN;

              if (tursoUrl && tursoToken) {
                console.log("[Auth] Trying direct Turso fallback");
                const client = createClient({ url: tursoUrl, authToken: tursoToken });
                const result = await client.execute({
                  sql: 'SELECT id, name, email, password, role, isActive FROM User WHERE email = ?',
                  args: [credentials.email],
                });

                if (result.rows.length === 0) {
                  console.log("[Auth] User not found in Turso either");
                  return null;
                }

                const row = result.rows[0];
                const isValid = await verifyPassword(credentials.password, row.password as string);

                if (!isValid) {
                  console.log("[Auth] Password invalid");
                  return null;
                }

                console.log("[Auth] Login via Turso fallback for:", row.email);
                return {
                  id: row.id as string,
                  name: row.name as string,
                  email: row.email as string,
                  role: row.role as string,
                };
              }
            } catch (tursoError) {
              console.error("[Auth] Turso fallback also failed:", tursoError);
            }
            return null;
          }

          if (!user) {
            console.log("[Auth] User not found:", credentials.email);
            return null;
          }

          if (!user.isActive) {
            console.log("[Auth] User inactive:", credentials.email);
            return null;
          }

          const isValid = await verifyPassword(credentials.password, user.password);
          if (!isValid) {
            console.log("[Auth] Password invalid for:", credentials.email);
            return null;
          }

          console.log("[Auth] Login successful:", credentials.email, "role:", user.role);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
        } catch (error) {
          console.error("[Auth] Error during authorization:", error);
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
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
