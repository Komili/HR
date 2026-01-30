import { jwtDecode } from "jwt-decode";
import { apiFetch } from "./api";
import type { AuthUser } from "./types";

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const data = await apiFetch<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });

  const token = data.access_token;
  const user = jwtDecode<AuthUser>(token);

  return { token, user };
}

export async function register(
  email: string,
  password: string,
  roleId?: number,
): Promise<unknown> {
  return apiFetch("/auth/register", {
    method: "POST",
    body: { email, password, roleId },
  });
}
