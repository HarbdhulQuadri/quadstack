// @ts-check
import nextPlugin from "eslint-config-next";
import { base } from "./base.js";

/** @type {import("eslint").Linter.FlatConfig[]} */
export const next = [
  ...base,
  ...nextPlugin,
  {
    rules: {
      // Next.js allows default exports in page/layout/route files
      "import/no-default-export": "off",
    },
  },
];
