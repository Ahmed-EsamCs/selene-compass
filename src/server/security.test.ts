import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "./security";

describe("security headers", () => {
  it("adds baseline headers and keeps status, body and existing headers", async () => {
    const res = withSecurityHeaders(
      new Response("hi", {
        status: 201,
        headers: { "content-type": "text/plain", "referrer-policy": "no-referrer" },
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("hi");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.has("x-frame-options")).toBe(false); // Lovable previews in an iframe
  });
});
