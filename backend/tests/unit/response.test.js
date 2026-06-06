import { describe, it, expect, vi } from "vitest";
import { sendSuccess, sendError } from "../../src/utils/response.js";

describe("sendSuccess", () => {
  it("returns 200 with success envelope by default", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };

    sendSuccess(res, { foo: "bar" });

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true, foo: "bar" });
  });

  it("respects custom status code", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };

    sendSuccess(res, { id: 1 }, 201);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ success: true, id: 1 });
  });

  it("uses empty object as default payload", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };

    sendSuccess(res);

    expect(json).toHaveBeenCalledWith({ success: true });
  });
});

describe("sendError", () => {
  it("returns 400 by default with message", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };

    sendError(res, "Bad request");

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ success: false, message: "Bad request" });
  });

  it("supports extra fields (e.g. details)", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };

    sendError(res, "Conflict", 409, { details: { field: "email" } });

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Conflict",
      details: { field: "email" }
    });
  });
});
