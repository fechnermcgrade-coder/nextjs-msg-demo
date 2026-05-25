import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function routeError(error: unknown) {
  if (error instanceof Response) {
    let message = error.statusText || "Request failed";

    try {
      const text = await error.clone().text();
      if (text.trim()) message = text.trim();
    } catch {
      // Keep the status text fallback when the response body cannot be read.
    }

    return bad(message, error.status || 500);
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return bad(message, 500);
}
