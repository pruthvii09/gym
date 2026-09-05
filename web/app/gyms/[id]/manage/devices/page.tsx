"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MonitorPlay, Plus, RotateCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createGymDevice, listGymDevices, rotateGymDevice } from "@/lib/api/gym-manage";
import { ApiError } from "@/lib/api/client";
import { useGymManageContext } from "../gym-manage-context";
import type { GymDevice } from "@/types/api";

function DeviceRow({
  gymId,
  device,
  onChanged,
}: {
  gymId: string;
  device: GymDevice;
  onChanged: () => void;
}) {
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRotate = async () => {
    setRotating(true);
    setError(null);
    try {
      const result = await rotateGymDevice(device.id);
      setNewSecret(result.secret);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't rotate this device.");
    } finally {
      setRotating(false);
    }
  };

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{device.name}</p>
          <p className="text-sm text-muted-foreground">{device.device_code}</p>
        </div>
        <Badge
          variant="outline"
          className={
            device.status === "active"
              ? "border-success/20 bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          }
        >
          {device.status === "active" ? "Active" : "Disabled"}
        </Badge>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {newSecret ? (
        <Alert className="border-warning/25 bg-warning/5 text-warning">
          <AlertDescription className="text-current">
            New secret (shown once): <span className="font-mono">{newSecret}</span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/gyms/${gymId}/display/${device.id}`} target="_blank" />}
        >
          <MonitorPlay />
          Display mode
        </Button>
        <Button variant="ghost" size="sm" onClick={handleRotate} disabled={rotating}>
          {rotating ? <Loader2 className="animate-spin" /> : <RotateCw />}
          Rotate secret
        </Button>
      </div>
    </li>
  );
}

export default function GymDevicesPage() {
  const { gymId } = useGymManageContext();
  const [devices, setDevices] = useState<GymDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const load = () => {
    listGymDevices(gymId)
      .then((res) => setDevices(res.results))
      .catch(() => {
        setDevices([]);
        setError("Couldn't load devices. Refresh to try again.");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  const handleCreate = async () => {
    if (!newDeviceName.trim()) return;
    setCreating(true);
    setError(null);
    setCreatedSecret(null);
    try {
      const device = await createGymDevice(gymId, newDeviceName.trim());
      setCreatedSecret(device.secret);
      setNewDeviceName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create this device.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check-in devices</h1>
        <p className="mt-1 text-muted-foreground">
          Kiosks that display a rotating check-in code for members to scan. Open{" "}
          <span className="font-medium text-foreground">Display mode</span> on a front-desk
          tablet or TV to show a full-screen, scannable code.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Add a device</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="space-y-1.5 sm:flex-1">
              <Label htmlFor="device-name" className="sr-only">
                Device name
              </Label>
              <Input
                id="device-name"
                placeholder="Front Desk Kiosk"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
              />
            </div>
            <Button onClick={handleCreate} disabled={creating || !newDeviceName.trim()}>
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              Add device
            </Button>
          </div>
          {createdSecret ? (
            <Alert className="border-warning/25 bg-warning/5 text-warning">
              <AlertDescription className="text-current">
                Device secret (shown once): <span className="font-mono">{createdSecret}</span>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {devices === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No check-in devices yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {devices.map((device) => (
                <DeviceRow key={device.id} gymId={gymId} device={device} onChanged={load} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
