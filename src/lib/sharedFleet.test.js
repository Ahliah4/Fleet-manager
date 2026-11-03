import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSharedFleet, saveSharedRecord } from "./sharedFleet";

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("shared fleet hire history", () => {
    it("loads all hire statuses and uses only the active hire for vehicle assignment", async () => {
        const fetchMock = vi.fn(async (url) => {
            if (url === "/api/v1/me") return json({ membership: { permissions: ["fleet.vehicles.read", "fleet.operations.read"] } });
            if (url.startsWith("/api/v1/vehicles?")) return json({ vehicles: [{ id: "vehicle-1", registrationNumber: "ABC 1", make: "Honda", model: "Fit" }], pagination: { total: 1 } });
            if (url.startsWith("/api/v1/drivers?")) return json({ drivers: [{ id: "driver-1", fullName: "Test Driver", status: "active" }], pagination: { total: 1 } });
            if (url.startsWith("/api/v1/hires?")) return json({ hires: [{ id: "old", vehicleId: "vehicle-1", driverId: "driver-1", driverName: "Old Driver", status: "completed" }, { id: "current", vehicleId: "vehicle-1", driverId: "driver-1", driverName: "Test Driver", status: "active" }], pagination: { total: 2 } });
            throw new Error(`Unexpected request: ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await loadSharedFleet();

        expect(result.data.hires).toHaveLength(2);
        expect(result.data.vehicles[0]).toMatchObject({ status: "On hire", assignedDriver: "Test Driver" });
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/hires?limit=100&offset=0", expect.any(Object));
    });

    it("creates a hire with API timestamps", async () => {
        const fetchMock = vi.fn(async () => json({ hire: { id: "hire-1" } }, 201));
        vi.stubGlobal("fetch", fetchMock);

        await saveSharedRecord("hires", { vehicleId: "vehicle-1", driverId: "driver-1", status: "planned", startsAt: "2026-11-03", expectedEndAt: "2026-11-10", actualEndAt: "", notes: "Weekly hire" });

        expect(fetchMock).toHaveBeenCalledWith("/api/v1/hires", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ vehicleId: "vehicle-1", driverId: "driver-1", status: "planned", startsAt: "2026-11-03T00:00:00.000Z", expectedEndAt: "2026-11-10T00:00:00.000Z", actualEndAt: null, notes: "Weekly hire" }),
        }));
    });
});
