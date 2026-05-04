import type { AppTemplate } from "./types";

export const blank: AppTemplate = {
  id:                   "blank",
  name:                 "Blank",
  description:          "Base template only — no domain schema",
  hint:                 "Start from scratch",
  defaultPayments:      [],
  defaultAuthProviders: ["email"],

  generate: () => ({}), // nothing extra to write
};
