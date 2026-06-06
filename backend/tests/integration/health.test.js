// Integration test: app boots, /api/health returns 200 + healthy body
// and rate-limit headers appear on real HTTP requests.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

// Mock mongoose BEFORE importing app — avoids real DB connection
vi.mock("../../src/config/db.js", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("../../src/utils/ensureAdminAccount.js", () => ({
  ensureAdminAccount: vi.fn().mockResolvedValue(undefined)
}));

let app;

beforeAll(async () => {
  const mod = await import("../../src/app.js");
  app = mod.default;
});

afterAll(async () => {
  // No DB to close — mongoose was mocked
});

describe("GET /api/health", () => {
  it("returns 200 with success: true", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "API is healthy" });
  });

  it("is not rate-limited (health checks must never throttle)", async () => {
    // Hit it 50 times — all should succeed
    for (let i = 0; i < 50; i += 1) {
       
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /", () => {
  it("returns service banner", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("Security headers (helmet)", () => {
  it("sets X-Content-Type-Options", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does not leak X-Powered-By", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Unknown route → 404", () => {
  it("returns 404 JSON envelope for unmatched paths", async () => {
    // /totally-bogus doesn't match any of /api/auth, /api/admin, /api/* mount points
    const res = await request(app).get("/totally-bogus-path");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Route not found" });
  });
});

describe("Rate limiting on /api/* (excluding /api/health)", () => {
  it("emits RateLimit-* headers on API routes", async () => {
    const res = await request(app).get("/api/auth/login");
    // 401 (no creds) is fine — we just want to confirm the limiter ran
    expect([400, 401, 422]).toContain(res.status);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });
});
