import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    sessionEpoch?: number;
  }
  interface Session {
    epoch?: number;
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    epoch?: number;
  }
}
