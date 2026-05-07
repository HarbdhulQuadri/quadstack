export type { AppTemplate } from "./types";

export { blank }       from "./blank";
export { saas }        from "./saas";
export { ecommerce }   from "./ecommerce";
export { lms }         from "./lms";
export { blog }        from "./blog";
export { marketplace } from "./marketplace";
export { booking }     from "./booking";
export { jobboard }    from "./jobboard";
export { community }   from "./community";
export { events }      from "./events";
export { invoicing }   from "./invoicing";

import { blank }       from "./blank";
import { blog }        from "./blog";
import { ecommerce }   from "./ecommerce";
import { lms }         from "./lms";
import { marketplace } from "./marketplace";
import { saas }        from "./saas";
import { booking }     from "./booking";
import { jobboard }    from "./jobboard";
import { community }   from "./community";
import { events }      from "./events";
import { invoicing }   from "./invoicing";
import type { AppTemplate } from "./types";

export const templates: AppTemplate[] = [
  blank,
  saas,
  ecommerce,
  lms,
  blog,
  marketplace,
  booking,
  jobboard,
  community,
  events,
  invoicing,
];

export function getTemplate(id: string): AppTemplate {
  const t = templates.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
