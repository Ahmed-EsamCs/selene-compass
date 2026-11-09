import { createFileRoute } from "@tanstack/react-router";
import { ephemerisQuerySchema, getEphemeris, UpstreamError } from "@/server/horizons";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

/**
 * GET /api/ephemeris?lat=-89.67&lon=129.78&alt=1.2[&days=30&step=6]
 * Real Sun and Earth azimuth/elevation seen from a lunar surface site, proxied from
 * NASA JPL Horizons (no API key needed; the browser never calls Horizons directly).
 */
export const Route = createFileRoute("/api/ephemeris")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = Object.fromEntries(new URL(request.url).searchParams);
        const parsed = ephemerisQuerySchema.safeParse(params);
        if (!parsed.success) {
          return json(
            {
              error: "Invalid query",
              issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            },
            400,
          );
        }
        try {
          const data = await getEphemeris(parsed.data);
          return json(data, 200, {
            // Ephemerides are deterministic for a given hour: let the edge cache them.
            "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
          });
        } catch (e) {
          const status = e instanceof UpstreamError ? e.status : 500;
          console.error("ephemeris:", e);
          return json(
            {
              error:
                e instanceof UpstreamError
                  ? e.message
                  : "Unexpected error while querying NASA JPL Horizons",
            },
            status,
            { "cache-control": "no-store" },
          );
        }
      },
    },
  },
});
