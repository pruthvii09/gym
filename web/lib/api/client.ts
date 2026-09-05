import { getAccessToken } from "@/lib/auth/session";
import type { ApiErrorBody } from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** First message for a given field from the DRF-shaped `details`, if present. */
  fieldError(field: string): string | undefined {
    const value = this.details?.[field];
    return Array.isArray(value) ? String(value[0]) : undefined;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (opts.auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "network_error", "Couldn't reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body, fall through to the generic message below
    }
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? "Something went wrong. Please try again.",
      err?.details
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
