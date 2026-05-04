import type { Session, User } from "@quadstack/auth";
import type { db } from "@quadstack/db/client";

export interface BaseContext {
  db: typeof db;
  headers: Headers;
}

export interface AuthContext extends BaseContext {
  session: Session;
  user: User;
}
