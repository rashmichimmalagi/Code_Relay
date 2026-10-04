export const EDITOR_STORAGE_PREFIX = "__CODERELAY_EDITOR_V1__";

export interface EditorParts {
  before: string;
  body: string;
  after: string;
}

/**
 * Clean Round 2 code by removing any editor metadata wrapper.
 *
 * Requirements:
 * - CASE A (already clean code): Return rawCode exactly as-is.
 * - CASE B (wrapped code with empty before/after): Return body exactly as-is.
 * - CASE C (wrapper with before/after content): Return combined source:
 *     before + body + after according to existing editor architecture.
 * - CASE D (malformed wrapper): Safely fall back to rawCode without throwing or losing code.
 * - CASE E (empty / null / undefined code): Return empty string "".
 *
 * CRITICAL: The student's code itself must NEVER be modified, corrected, reformatted, or "fixed".
 * Only the editor metadata wrapper must be removed.
 */
export function cleanRound2Code(rawCode: string | null | undefined): string {
  if (!rawCode || typeof rawCode !== "string") {
    return "";
  }

  const trimmed = rawCode.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith(EDITOR_STORAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        trimmed.slice(EDITOR_STORAGE_PREFIX.length),
      ) as Partial<EditorParts>;

      if (parsed && typeof parsed === "object") {
        const before = typeof parsed.before === "string" ? parsed.before : "";
        const body = typeof parsed.body === "string" ? parsed.body : "";
        const after = typeof parsed.after === "string" ? parsed.after : "";

        // CASE C: wrapper with before/after content
        if (before.trim() || after.trim()) {
          const parts: string[] = [];
          if (before.trim()) parts.push(before);
          if (body) parts.push(body);
          if (after.trim()) parts.push(after);
          return parts.join("\n\n");
        }

        // CASE B: standard wrapped code
        if (typeof parsed.body === "string") {
          return parsed.body;
        }
      }
    } catch {
      // CASE D: Malformed wrapper. Safely fall back without destroying student code.
      return rawCode;
    }
  }

  // Handle case where raw wrapper JSON was stored without prefix
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<EditorParts>;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.body === "string"
      ) {
        const before = typeof parsed.before === "string" ? parsed.before : "";
        const body = parsed.body;
        const after = typeof parsed.after === "string" ? parsed.after : "";

        if (before.trim() || after.trim()) {
          const parts: string[] = [];
          if (before.trim()) parts.push(before);
          if (body) parts.push(body);
          if (after.trim()) parts.push(after);
          return parts.join("\n\n");
        }

        return body;
      }
    } catch {
      // Not JSON or parse failed - safely fall back to rawCode
      return rawCode;
    }
  }

  // CASE A: already clean code
  return rawCode;
}

/**
 * Backward compatibility alias for cleanRound2Code.
 */
export const extractCleanCode = cleanRound2Code;

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
 * Legacy serialization helper. Maintained for backward compatibility.
 * Do NOT use to wrap code before saving to database.
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
