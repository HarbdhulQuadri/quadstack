import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { OpenAPIGenerator } from "@orpc/openapi";

import { appRouter } from "../orpc-routers";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

export async function generateSpec(baseUrl: string) {
  return generator.generate(appRouter, {
    info: {
      title:       "QuadStack API",
      version:     "1.0.0",
      description: "Auto-generated from ORPC router definitions.",
    },
    servers: [{ url: `${baseUrl}/api/rpc` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  });
}
