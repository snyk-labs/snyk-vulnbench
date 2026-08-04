import session from "@/types/express-session";

declare module "express-session" {
  interface SessionData {
    isAdmin?: boolean;
  }
}