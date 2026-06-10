import { supabase } from "@/lib/supabaseClient";

export class DevPanelApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "DevPanelApiError";
  }
}

export async function callDevPanelApi<T = unknown>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", body } = options;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new DevPanelApiError("UNAUTHORIZED", "Session not found", 401);
  }

  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new DevPanelApiError(
      payload?.error || "request_failed",
      payload?.message || "Dev panel API request failed",
      response.status
    );
  }

  return payload.data as T;
}
