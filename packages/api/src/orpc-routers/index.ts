import { authRouter } from "./auth";

// Add new routers here and re-export.
// Each router is a plain object of procedures — ORPC merges them at the route handler.
export const appRouter = {
  auth: authRouter,
};

export type AppRouter = typeof appRouter;
