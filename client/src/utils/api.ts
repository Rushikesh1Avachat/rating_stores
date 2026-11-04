const API = "/api";
const TOKEN_KEY = "goodmark-token";
const SESSION_EXPIRED_EVENT = "goodmark:session-expired";

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const responseText = await response.text();
  let body: Record<string, unknown> = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      throw new Error("The server returned an invalid response.");
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new Error(typeof body.error === "string" ? body.error : "Something went wrong. Please try again.");
  }
  return body as T;
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export { SESSION_EXPIRED_EVENT };
