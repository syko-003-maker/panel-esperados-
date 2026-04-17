import { NextResponse } from "next/server";

type JsonErrorBody = {
  ok: false;
  error: string;
  details: string;
  [key: string]: unknown;
};

export function jsonError(
  status: number,
  error: string,
  details: string,
  extra?: Record<string, unknown>
) {
  const body: JsonErrorBody = {
    ok: false,
    error,
    details,
    ...(extra ?? {}),
  };

  return NextResponse.json(body, { status });
}
