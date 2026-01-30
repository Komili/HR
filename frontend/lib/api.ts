const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type ApiFetchOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: HeadersInit;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("authToken");
}

function buildUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalized}`;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body: isForm
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text) as { message?: string };
      throw new Error(data.message || response.statusText);
    } catch {
      throw new Error(text || response.statusText);
    }
  }

  return response.json() as Promise<T>;
}

export async function apiFetchRaw(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(buildUrl(path), {
    ...options,
    headers,
    body: isForm
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });
}
