export type { AppTemplate } from "./types";

export { blank }       from "./blank";
export { saas }        from "./saas";
export { ecommerce }   from "./ecommerce";
export { lms }         from "./lms";
export { blog }        from "./blog";
export { marketplace } from "./marketplace";

import { blank }       from "./blank";
import { blog }        from "./blog";
import { ecommerce }   from "./ecommerce";
import { lms }         from "./lms";
import { marketplace } from "./marketplace";
import { saas }        from "./saas";
import type { AppTemplate } from "./types";

export const templates: AppTemplate[] = [
  blank,
  saas,
  ecommerce,
  lms,
  blog,
  marketplace,
];

export function getTemplate(id: string): AppTemplate {
  const t = templates.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
