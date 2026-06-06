import { describe, it, expect, vi } from "vitest";
import { errorHandler } from "../../src/middleware/errorHandler.js";

function mockRes(headersSent = false) {
  return {
    headersSent,
    status: vi.fn(function () { return this; }),
    json: vi.fn(function () { return this; })
  };
}

describe("errorHandler — MongoDB error normalization", () => {
  it("maps ValidationError → 422 with details", () => {
    const err = {
      name: "ValidationError",
      errors: { email: { message: "Invalid email" } }
    };
    const res = mockRes();
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Validation failed",
      details: ["Invalid email"]
    });
  });

  it("maps CastError → 400", () => {
    const err = { name: "CastError" };
    const res = mockRes();
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      success: false,
      message: "Invalid resource identifier"
    });
  });

  it("maps duplicate-key (E11000) → 409 with keyValue", () => {
    const err = { code: 11000, keyValue: { email: "x@y.z" } };
    const res = mockRes();
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      success: false,
      message: "Duplicate resource detected",
      details: { email: "x@y.z" }
    });
  });

  it("uses err.statusCode / err.message when present", () => {
    const err = Object.assign(new Error("Custom"), { statusCode: 418 });
    const res = mockRes();
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json.mock.calls[0][0].message).toBe("Custom");
  });

  it("falls back to 500 / 'Internal server error'", () => {
    const err = new Error("boom");
    const res = mockRes();
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toBe("boom");
  });

  it("delegates to next() if headers already sent", () => {
    const err = new Error("too late");
    const res = mockRes(true);
    const next = vi.fn();
    errorHandler(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
