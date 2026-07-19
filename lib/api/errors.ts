import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * The error contract from docs/api-contracts.md. Every handler returns this
 * shape — nothing else.
 *
 *   { "error": { "code": "...", "message": "...", "fields": { ... } } }
 */
export const errorCodes = {
  unauthorized: 401,
  forbidden: 403,
  validation_error: 422,
  not_found: 404,
  quota_exceeded: 402,
  provider_error: 502,
  server_error: 500,
} as const;

export type ErrorCode = keyof typeof errorCodes;

export type ApiError = {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
};

/**
 * Messages are in the interface's voice (api-contracts.md). They are not routed
 * through next-intl: these are API responses, not UI copy, and a handler has no
 * request locale to resolve against. The UI maps `code` to a localized string
 * from /messages `errors.*` when it renders one.
 */
export function apiError(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
) {
  const body: ApiError = { error: { code, message, ...(fields && { fields }) } };
  return NextResponse.json(body, { status: errorCodes[code] });
}

export const unauthorized = () =>
  apiError("unauthorized", "Sign in to continue.");

export const forbidden = () =>
  apiError("forbidden", "You don't have access to this.");

export const notFound = (what = "that") =>
  apiError("not_found", `We couldn't find ${what}.`);

export const serverError = () =>
  apiError("server_error", "Something went wrong on our side.");

/** Flattens a zod error into the contract's `fields` map. */
export function validationError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    fields[path] ??= issue.message;
  }
  return apiError(
    "validation_error",
    "Some details are missing or need a second look.",
    fields,
  );
}
