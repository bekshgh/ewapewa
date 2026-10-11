"use client";

/** JSON call to the conversion API; throws with the server's readable message. */
export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Ошибка ${res.status}`);
  return data as T;
}

export const ru = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("ru-RU"));
