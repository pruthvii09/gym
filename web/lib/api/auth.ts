import { apiFetch } from "@/lib/api/client";
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterRequest,
  RegisterResponse,
} from "@/types/api";

export function register(payload: RegisterRequest) {
  return apiFetch<RegisterResponse>("/api/v1/auth/register/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: LoginRequest) {
  return apiFetch<LoginResponse>("/api/v1/auth/login/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout(refresh: string) {
  return apiFetch<Record<string, never>>("/api/v1/auth/logout/", {
    method: "POST",
    body: JSON.stringify({ refresh }),
  });
}

export function getMe() {
  return apiFetch<MeResponse>("/api/v1/me/", {}, { auth: true });
}
