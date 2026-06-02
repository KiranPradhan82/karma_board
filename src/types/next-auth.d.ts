import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      mustChangePassword?: boolean;
      accountType?: "team" | "client";
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    mustChangePassword?: boolean;
    accountType?: "team" | "client";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    mustChangePassword?: boolean;
    accountType?: "team" | "client";
  }
}
