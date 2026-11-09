import { afterEach, describe, expect, it, vi } from "vitest";
import { clearEphemerisCache, ephemerisQuerySchema, getEphemeris, toRequest, UpstreamError } from "./horizons";

const block = (rows: string) => `
 Date__(UT)__HR:MN, , , Azi_(a-app), Elev_(a-app),
$$SOE
${rows}
$$EOE
`;
const ok = (rows: string) =>
  new Response(JSON.stringify({ signature: { source: "NASA/JPL Horizons API", version: "1.3" }, result: block(rows) }), {
    status: 200,
  });

const query = ephemerisQuerySchema.parse({ lat: "-89.67", lon: "129.78", alt: "1.2" });
const NOW = Date.UTC(2026, 10, 9, 21, 37);

afterEach(() => clearEphemerisCache());

describe("query validation", () => {
  it("applies defaults and rejects sites outside the south-pole window", () => {
    expect(query).toMatchObject({ days: 30, step: 6, alt: 1.2 });
    expect(ephemerisQuerySchema.safeParse({ lat: "-60", lon: "0" }).success).toBe(false);
    expect(ephemerisQuerySchema.safeParse({ lat: "-89", lon: "0", days: "400" }).success).toBe(false);
    expect(ephemerisQuerySchema.safeParse({ lat: "abc", lon: "0" }).success).toBe(false);
  });

  it("rounds the start to the hour so requests share a cache entry", () => {
    expect(toRequest(query, NOW).start.toISOString()).toBe("2026-11-09T21:00:00.000Z");
  });
});

describe("getEphemeris", () => {
  it("queries the Sun then the Earth and returns parsed samples", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok(" 2026-Nov-09 21:00, , ,  10.0,  1.0,"))
      .mockResolvedValueOnce(ok(" 2026-Nov-09 21:00, , ,  230.0,  2.5,"));
    const res = await getEphemeris(query, fetchImpl, NOW);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("COMMAND=%2710%27");
    expect(String(fetchImpl.mock.calls[1]![0])).toContain("COMMAND=%27399%27");
    expect(res.sun[0]).toMatchObject({ az: 10, el: 1 });
    expect(res.earth[0]).toMatchObject({ az: 230, el: 2.5 });
    expect(res.source).toMatchObject({ name: "NASA/JPL Horizons", version: "1.3" });
  });

  it("serves repeat requests from cache", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok(" 2026-Nov-09 21:00, , , 1, 1,"));
    await getEphemeris(query, fetchImpl, NOW);
    await getEphemeris(query, fetchImpl, NOW + 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 503 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockImplementation(async () => ok(" 2026-Nov-09 21:00, , , 1, 1,"));
    const res = await getEphemeris(query, fetchImpl, NOW);
    expect(res.sun).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("turns Horizons error payloads into a 502 and does not cache the failure", async () => {
    const bad = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: "Bad site" }), { status: 200 }));
    await expect(getEphemeris(query, bad, NOW)).rejects.toMatchObject({ status: 502 });
    const good = vi.fn().mockImplementation(async () => ok(" 2026-Nov-09 21:00, , , 1, 1,"));
    await expect(getEphemeris(query, good, NOW)).resolves.toBeTruthy();
  });

  it("reports a 504 when NASA cannot be reached", async () => {
    const down = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const err = await getEphemeris(query, down, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(504);
  });
});
