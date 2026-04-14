import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeyeCloudClient } from "../deye";

const mockTokenResponse = {
  code: 0,
  data: { accessToken: "test-token", expiresIn: 5184000 },
};

const mockDeviceLatest = {
  code: 0,
  data: [
    {
      deviceSn: "SN123",
      dataList: [
        { key: "SOC", value: "78" },
        { key: "BatteryPower", value: "500" },
        { key: "GridPower", value: "-200" },
        { key: "PVPower", value: "3200" },
        { key: "LoadPower", value: "1100" },
      ],
    },
  ],
};

describe("DeyeCloudClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("authenticates and caches token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockTokenResponse), { status: 200 })
    );

    const client = new DeyeCloudClient({
      appId: "app1",
      appSecret: "secret",
      email: "test@test.com",
      password: "pass",
      deviceSn: "SN123",
    });

    await client.authenticate();
    await client.authenticate(); // second call should use cache

    expect(fetchSpy).toHaveBeenCalledOnce(); // only one fetch
  });

  it("reads device status and parses SOC", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockTokenResponse), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockDeviceLatest), { status: 200 })
      );

    const client = new DeyeCloudClient({
      appId: "app1",
      appSecret: "secret",
      email: "test@test.com",
      password: "pass",
      deviceSn: "SN123",
    });

    const status = await client.getStatus();
    expect(status.soc).toBe(78);
    expect(status.pvPower).toBe(3200);
  });

  it("sends grid charge command", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockTokenResponse), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0 }), { status: 200 })
      );

    const client = new DeyeCloudClient({
      appId: "app1",
      appSecret: "secret",
      email: "test@test.com",
      password: "pass",
      deviceSn: "SN123",
    });

    await client.setGridCharge(true);

    const [url, options] = fetchSpy.mock.calls[1];
    expect(url).toContain("/order/battery/modeControl");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.action).toBe("on");
    expect(body.batteryModeType).toBe("GRID_CHARGE");
  });
});
