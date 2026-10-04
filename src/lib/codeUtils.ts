export const EDITOR_STORAGE_PREFIX = "__CODERELAY_EDITOR_V1__";

export interface EditorParts {
  before: string;
  body: string;
  after: string;
}

/**
 * Extract clean, plain source code from raw code or an editor wrapper.
 *
 * Requirements:
 * - If rawCode starts with __CODERELAY_EDITOR_V1__, parse JSON safely and return the body.
 * - If rawCode is a raw JSON string with a "body" property, return the body.
 * - If JSON parsing fails, safely fall back without throwing errors.
 * - If rawCode does not start with the prefix, return rawCode as-is.
 * - If null or undefined, return an empty string.
 */
export function extractCleanCode(rawCode: string | null | undefined): string {
  if (!rawCode || typeof rawCode !== "string") {
    return "";
  }

  const trimmed = rawCode.trim();

  if (trimmed.startsWith(EDITOR_STORAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        trimmed.slice(EDITOR_STORAGE_PREFIX.length),
      ) as Partial<EditorParts>;

      if (typeof parsed?.body === "string") {
        return parsed.body;
      }
    } catch {
      // JSON parsing failed, safely fall back without throwing errors
    }
  }

  // Handle case where raw wrapper JSON was stored without prefix
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<EditorParts>;
      if (typeof parsed?.body === "string") {
        return parsed.body;
      }
    } catch {
      // Not JSON or parse failed
    }
  }

  return rawCode;
}

/**
 * Parse a stored implementation into its constituent editor sections
 * (code before locked signature, function body, and code after locked signature).
 */
export function parseStoredImplementation(
  implementation: string | null | undefined,
): EditorParts {
  if (!implementation || typeof implementation !== "string") {
    return { before: "", body: "", after: "" };
  }

  const trimmed = implementation.trim();

  if (trimmed.startsWith(EDITOR_STORAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        trimmed.slice(EDITOR_STORAGE_PREFIX.length),
      ) as Partial<EditorParts>;

      return {
        before: typeof parsed?.before === "string" ? parsed.before : "",
        body: typeof parsed?.body === "string" ? parsed.body : "",
        after: typeof parsed?.after === "string" ? parsed.after : "",
      };
    } catch {
      // Fall through to legacy body-only format.
    }
  }

  // Handle case where raw wrapper JSON was stored without prefix
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<EditorParts>;
      if (
        typeof parsed?.body === "string" ||
        typeof parsed?.before === "string" ||
        typeof parsed?.after === "string"
      ) {
        return {
          before: typeof parsed?.before === "string" ? parsed.before : "",
          body: typeof parsed?.body === "string" ? parsed.body : "",
          after: typeof parsed?.after === "string" ? parsed.after : "",
        };
      }
    } catch {
      // Fall through
    }
  }

  return {
    before: "",
    body: implementation,
    after: "",
  };
}

/**
 * Serialize editor sections into the internal storage wrapper format.
 */
export function serializeEditorParts(parts: EditorParts): string {
  return (
    EDITOR_STORAGE_PREFIX +
    JSON.stringify({
      before: parts.before ?? "",
      body: parts.body ?? "",
      after: parts.after ?? "",
    })
  );
}
