import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoeClient } from "../goe";

// Sample realistic /status response (subset) from go-e v2 cloud:
// car: 2 = charging, alw: true, amp: 16, ama: 16, psm: 2 (3-phase)
// nrg: [V1,V2,V3,Vn, A1,A2,A3, P1,P2,P3,Ptot,PFs...]
const fakeStatus = {
  car: 2,
  alw: true,
  amp: 16,
  ama: 16,
  psm: 2,
  nrg: [233, 234, 232, 0, 16.1, 15.9, 16.0, 3750, 3720, 3740, 11210, 0.99, 0.99, 0.99, 0.99],
  wh: 12450,
  eto: 8421000,
  frc: 0,
};

describe("GoeClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses charging status with 3-phase correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeStatus,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = new GoeClient({ token: "test-token", deviceId: "GCH-123" });
    const status = await client.getStatus();

    expect(status.carState).toBe("charging");
    expect(status.allowCharging).toBe(true);
    expect(status.chargeCurrent).toBe(16);
    expect(status.phases).toBe(3);
    expect(status.power).toBe(11210);
    expect(status.sessionWh).toBe(12450);
    expect(status.voltages).toEqual([233, 234, 232]);
    expect(status.forceState).toBe("neutral");

    // URL should include token and device id
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("token=test-token");
    expect(calledUrl).toContain("id=GCH-123");
  });

  it("maps car=1 to idle and psm=1 to single-phase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...fakeStatus, car: 1, psm: 1, alw: false, frc: 1 }),
      } as Response)
    );
    const client = new GoeClient({ token: "t" });
    const s = await client.getStatus();
    expect(s.carState).toBe("idle");
    expect(s.phases).toBe(1);
    expect(s.allowCharging).toBe(false);
    expect(s.forceState).toBe("off");
  });

  it("setCurrent sends amp param", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = new GoeClient({ token: "t" });
    await client.setCurrent(10.7);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("amp=10"); // floored
  });

  it("setForceState maps values correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = new GoeClient({ token: "t" });
    await client.setForceState("on");
    expect((fetchMock.mock.calls[0][0] as string)).toContain("frc=2");

    await client.setForceState("off");
    expect((fetchMock.mock.calls[1][0] as string)).toContain("frc=1");

    await client.setForceState("neutral");
    expect((fetchMock.mock.calls[2][0] as string)).toContain("frc=0");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      } as Response)
    );
    const client = new GoeClient({ token: "bad" });
    await expect(client.getStatus()).rejects.toThrow(/go-e API 403/);
  });
});
