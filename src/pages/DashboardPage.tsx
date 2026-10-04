import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  basicSetup,
  EditorView,
} from "codemirror";

import {
  Compartment,
  EditorState,
} from "@codemirror/state";

import {
  indentOnInput,
  indentUnit,
} from "@codemirror/language";

import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";

import { useAuth } from "../context/AuthContext";
import { insforge } from "../lib/insforge";
import { getServerNow, syncServerTime } from "../lib/serverTime";

type TeamStatus = "PENDING" | "APPROVED" | "REJECTED";
type ProgrammingLanguage = "c" | "python";
type Round2Phase =
  | "CONFIGURED"
  | "QUESTION"
  | "TRANSITION"
  | "CODING"
  | "ENDED";

type Team = {
  id: string;
  team_number: number;
  team_name: string;
  created_by: string;
  student_1_name: string;
  student_2_name: string;
  student_3_name: string;
  status: TeamStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type Round2Session = {
  id: string;
  question_text: string;
  question_duration_seconds: number;
  coding_duration_seconds: number;
  student3_duration_seconds: number;
  phase_extension_seconds: number;
  question_extension_seconds?: number;
  coding_extension_seconds?: number;
  student3_extension_seconds?: number;
  coding_stage?: "STUDENT_2" | "STUDENT_3";
  phase: Round2Phase;
  phase_started_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function areRound2SessionsEqual(
  left: Round2Session | null,
  right: Round2Session | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    left.id === right.id &&
    left.question_text === right.question_text &&
    left.question_duration_seconds === right.question_duration_seconds &&
    left.coding_duration_seconds === right.coding_duration_seconds &&
    left.student3_duration_seconds === right.student3_duration_seconds &&
    left.phase_extension_seconds === right.phase_extension_seconds &&
    left.question_extension_seconds === right.question_extension_seconds &&
    left.coding_extension_seconds === right.coding_extension_seconds &&
    left.coding_stage === right.coding_stage &&
    left.phase === right.phase &&
    left.phase_started_at === right.phase_started_at &&
    left.created_by === right.created_by &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

type Round2Question = {
  question_id: string;
  title: string;
  question_text: string;
  function_signature_c: string | null;
  function_signature_python: string | null;
  interface_status: string;
};

type Round2JudgeConfig = {
  kind?: string;
  result_mode?:
    | "RETURN_VALUE"
    | "MUTATED_ARGUMENT"
    | "RETURN_VALUE_AND_MUTATION";
  return_type?: string;
  return_required?: boolean;
  target?: string;
};

type Round2VisibleTest = {
  id: string;
  input_data: unknown;
  expected_output: unknown;
};

type TeamCode = {
  id: string;
  session_id: string;
  team_id: string;
  question_id: string;
  language: ProgrammingLanguage;
  code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type CodeRunResult = {
  status: string;
  final_submission?: boolean;
  final_result_saved?: boolean;
  visible_cases?: Array<{
    case_number: number;
    input_data: unknown;
    output: unknown;
    expected_output: unknown;
    passed: boolean;
  }>;
};

type SubmissionSnapshot = {
  code: string;
  language: ProgrammingLanguage;
  status: string;
  submitted_at: string;
  score?: number;
  max_score?: number;
  passed_cases?: number;
  total_cases?: number;
  failed_cases?: number;
};

function ActionIcon({
  name,
  className = "h-4 w-4",
}: {
  name: "clear" | "restore" | "save" | "run" | "submit" | "format";
  className?: string;
}) {
  if (name === "clear") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    );
  }

  if (name === "restore") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v6h6" />
      </svg>
    );
  }

  if (name === "save") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M8 3v6h8V3" />
        <path d="M8 21v-7h8v7" />
      </svg>
    );
  }

  if (name === "run") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M8 5.2v13.6a1 1 0 0 0 1.54.84l10.2-6.8a1 1 0 0 0 0-1.66L9.54 4.36A1 1 0 0 0 8 5.2Z" />
      </svg>
    );
  }

  if (name === "format") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M4 6h16" />
        <path d="M4 10h10" />
        <path d="M4 14h16" />
        <path d="M4 18h10" />
        <path d="M18 8v4" />
        <path d="M16 10h4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

const LANGUAGE_LABELS: Record<ProgrammingLanguage, string> = {
  c: "C",
  python: "Python",
};

const EMPTY_FUNCTION_MESSAGE: Record<ProgrammingLanguage, string> = {
  c: "/* Official function interface is not available. */",
  python: "# Official function interface is not available.",
};

function formatInlineTestValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(formatInlineTestValue).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}:${formatInlineTestValue(item)}`)
      .join(",")}}`;
  }
  return String(value);
}

function formatTestValue(value: unknown, indentation = 0): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return formatInlineTestValue(value);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "{}";

    const childIndent = indentation + 2;
    const fields = entries.map(([key, item]) => {
      const rendered = item && typeof item === "object" && !Array.isArray(item)
        ? formatTestValue(item, childIndent)
        : formatInlineTestValue(item);
      return `${" ".repeat(childIndent)}${JSON.stringify(key)}: ${rendered}`;
    });

    return `{
${fields.join(",\n")}
${" ".repeat(indentation)}}`;
  }

  return String(value);
}

function formatTestInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return formatTestValue(value);
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([name, input]) => `${name} = ${formatTestValue(input)}`)
    .join("\n");
}

function formatOutputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(formatOutputValue).join(",")}]`;
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key} = ${formatOutputValue(item)}`)
      .join(", ");
  }
  return String(value);
}

function normalizeOutputForDisplay(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(normalizeOutputForDisplay);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    const hasK = "k" in record;
    const hasElementsArray = "elements" in record && Array.isArray(record.elements);

    for (const [k, v] of Object.entries(record)) {
      if (hasK && hasElementsArray && k === "elements" && Array.isArray(v)) {
        const sorted = [...v].sort((a, b) => {
          if (typeof a === "number" && typeof b === "number") {
            return a - b;
          }
          return String(a).localeCompare(String(b));
        });
        normalized[k] = sorted.map(normalizeOutputForDisplay);
      } else {
        normalized[k] = normalizeOutputForDisplay(v);
      }
    }
    return normalized;
  }
  return value;
}

function formatTestOutput(value: unknown): string {
  if (typeof value === "string") {
    try {
      return formatTestOutput(JSON.parse(value) as unknown);
    } catch {
      return value;
    }
  }

  const normalized = normalizeOutputForDisplay(value);

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return formatOutputValue(normalized);
  }

  const fields: string[] = [];
  const appendFields = (
    record: Record<string, unknown>,
    prefix = "",
  ) => {
    for (const [key, item] of Object.entries(record)) {
      const field = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        appendFields(item as Record<string, unknown>, field);
      } else {
        fields.push(`${field} = ${formatOutputValue(item)}`);
      }
    }
  };

  appendFields(normalized as Record<string, unknown>);
  return fields.join("\n") || "{}";
}

function getOfficialSignature(
  question: Round2Question | null,
  language: ProgrammingLanguage,
) {
  if (!question) return "";
  if (language === "c") return question.function_signature_c?.trim() ?? "";
  return question.function_signature_python?.trim() ?? "";
}

function normalizeImplementationBody(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  if (!nonEmpty.length) return "";

  const indents = nonEmpty.map((line) => {
    const match = line.match(/^[ \\t]*/);
    return match ? match[0].replace(/\\t/g, "    ").length : 0;
  });

  const commonIndent = Math.min(...indents);

  return lines
    .map((line) => {
      if (!line.trim()) return "";
      const expanded = line.replace(/\\t/g, "    ");
      return expanded.slice(Math.min(commonIndent, expanded.length));
    })
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

function indentImplementationForEditor(body: string) {
  const normalized = normalizeImplementationBody(body);
  if (!normalized) return "";

  return normalized
    .split("\n")
    .map((line) => (line.trim() ? `    ${line}` : ""))
    .join("\n");
}

const EDITOR_STORAGE_PREFIX = "__CODERELAY_EDITOR_V1__";

type EditorParts = {
  before: string;
  body: string;
  after: string;
};

function parseStoredImplementation(implementation: string): EditorParts {
  if (implementation.startsWith(EDITOR_STORAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        implementation.slice(EDITOR_STORAGE_PREFIX.length),
      ) as Partial<EditorParts>;

      return {
        before: typeof parsed.before === "string" ? parsed.before : "",
        body: typeof parsed.body === "string" ? parsed.body : "",
        after: typeof parsed.after === "string" ? parsed.after : "",
      };
    } catch {
      // Fall through to the legacy body-only format.
    }
  }

  return {
    before: "",
    body: implementation,
    after: "",
  };
}

function serializeEditorParts(parts: EditorParts): string {
  return (
    EDITOR_STORAGE_PREFIX +
    JSON.stringify({
      before: parts.before,
      body: parts.body,
      after: parts.after,
    })
  );
}

function findPythonFunctionEnd(lines: string[], signatureIndex: number) {
  let bodyStarted = false;

  for (let i = signatureIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) continue;

    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    if (indent > 0) {
      bodyStarted = true;
      continue;
    }

    if (bodyStarted) return i;
  }

  return lines.length;
}

function extractEditorParts(
  document: string,
  question: Round2Question | null,
  language: ProgrammingLanguage,
): EditorParts {
  const signature = getOfficialSignature(question, language);
  if (!signature) {
    return { before: "", body: document, after: "" };
  }

  const lines = document.replace(/\r\n/g, "\n").split("\n");
  const signatureLine = language === "python"
    ? signature
    : `${signature} {`;

  const signatureIndex = lines.findIndex(
    (line) => line.trimEnd() === signatureLine,
  );

  if (signatureIndex < 0) {
    return { before: "", body: "", after: "" };
  }

  const before = lines.slice(0, signatureIndex).join("\n");

  if (language === "python") {
    const endIndex = findPythonFunctionEnd(lines, signatureIndex);
    const body = lines
      .slice(signatureIndex + 1, endIndex)
      .join("\n");

    const after = lines.slice(endIndex).join("\n");

    return {
      before: normalizeImplementationBody(before),
      body: normalizeImplementationBody(body),
      after: normalizeImplementationBody(after),
    };
  }

  // C: find the matching closing brace for the official function.
  const signatureText = lines[signatureIndex];
  let depth = (signatureText.match(/{/g) ?? []).length -
    (signatureText.match(/}/g) ?? []).length;
  let endIndex = -1;

  for (let i = signatureIndex + 1; i < lines.length; i++) {
    depth += (lines[i].match(/{/g) ?? []).length;
    depth -= (lines[i].match(/}/g) ?? []).length;

    if (depth === 0) {
      endIndex = i;
      break;
    }
  }

  if (endIndex < 0) {
    return { before: "", body: "", after: "" };
  }

  return {
    before: normalizeImplementationBody(before),
    body: normalizeImplementationBody(
      lines.slice(signatureIndex + 1, endIndex).join("\n"),
    ),
    after: normalizeImplementationBody(
      lines.slice(endIndex + 1).join("\n"),
    ),
  };
}

function buildFunctionDocument(
  question: Round2Question | null,
  language: ProgrammingLanguage,
  implementation: string,
) {
  const signature =
    getOfficialSignature(question, language) ||
    EMPTY_FUNCTION_MESSAGE[language];

  const stored = parseStoredImplementation(implementation);

  // Keep visible empty lines before/after the locked interface so students
  // have an obvious place to add helper functions/code.
  const before = stored.before
    ? `${stored.before}\n\n`
    : "\n\n\n";

  const body = indentImplementationForEditor(stored.body);

  const after = stored.after
    ? `\n\n${stored.after}`
    : "\n\n\n";

  if (language === "python") {
    return body
      ? `${before}${signature}\n${body}${after}`
      : `${before}${signature}\n    ${after}`;
  }

  return body
    ? `${before}${signature} {\n${body}\n}${after}`
    : `${before}${signature} {\n    \n}${after}`;
}

function extractImplementation(
  document: string,
  question: Round2Question | null,
  language: ProgrammingLanguage,
) {
  return serializeEditorParts(
    extractEditorParts(document, question, language),
  );
}

function createLanguage(language: ProgrammingLanguage) {
  if (language === "python") return python();
  return cpp();
}

function stripPythonComment(line: string, tripleQuote: string | null) {
  let quote: string | null = tripleQuote;
  let escaped = false;
  let code = "";

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextThree = line.slice(index, index + 3);

    if (quote === "'''" || quote === '\"\"\"') {
      if (nextThree === quote) {
        code += nextThree;
        index += 2;
        quote = null;
      } else {
        code += char;
      }
      continue;
    }

    if (quote) {
      code += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (nextThree === "'''" || nextThree === '\"\"\"') {
      quote = nextThree;
      code += nextThree;
      index += 2;
    } else if (char === "'" || char === '\"') {
      quote = char;
      code += char;
    } else if (char === "#") {
      break;
    } else {
      code += char;
    }
  }

  return { code, tripleQuote: quote === "'''" || quote === '\"\"\"' ? quote : null };
}

function formatPythonIndentation(body: string) {
  let indentLevel = 0;
  let bracketDepth = 0;
  let tripleQuote: string | null = null;
  const output: string[] = [];

  const lines = normalizeImplementationBody(body).split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();
    if (!trimmed) {
      output.push("");
      continue;
    }

    const { code, tripleQuote: nextTripleQuote } = stripPythonComment(
      trimmed,
      tripleQuote,
    );
    const startsDedentedBlock = /^(elif|else|except|finally)\b/.test(code.trim());
    const isTerminalReturn =
      /^return\b/.test(code.trim()) &&
      !lines.slice(lineIndex + 1).some((line) => line.trim().length > 0);
    if (startsDedentedBlock && bracketDepth === 0) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    if (isTerminalReturn && bracketDepth === 0) indentLevel = 0;

    const lineIndent = bracketDepth > 0
      ? indentLevel + 1
      : indentLevel;
    output.push(`${"    ".repeat(lineIndent)}${trimmed}`);

    let quote: string | null = tripleQuote;
    let escaped = false;
    for (let index = 0; index < code.length; index++) {
      const char = code[index];
      const nextThree = code.slice(index, index + 3);
      if (quote === "'''" || quote === '\"\"\"') {
        if (nextThree === quote) {
          index += 2;
          quote = null;
        }
      } else if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
      } else if (nextThree === "'''" || nextThree === '\"\"\"') {
        quote = nextThree;
        index += 2;
      } else if (char === "'" || char === '\"') {
        quote = char;
      } else if ("([{ ".includes(char) && char !== " ") {
        bracketDepth++;
      } else if (")] }".includes(char) && char !== " ") {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }
    }

    const codeTrimmed = code.trimEnd();
    if (
      bracketDepth === 0 &&
      !tripleQuote &&
      /:\s*$/.test(codeTrimmed)
    ) {
      indentLevel++;
    }
    tripleQuote = nextTripleQuote;
  }

  return output.join("\n");
}

function formatCIndentation(body: string) {
  let indentLevel = 0;
  let inBlockComment = false;
  const output: string[] = [];

  for (const rawLine of normalizeImplementationBody(body).split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      output.push("");
      continue;
    }

    let depthChange = 0;
    let inString: string | null = null;
    let escaped = false;
    let firstClosingBrace = false;

    for (let index = 0; index < trimmed.length; index++) {
      const char = trimmed[index];
      const next = trimmed[index + 1];

      if (inBlockComment) {
        if (char === "*" && next === "/") {
          inBlockComment = false;
          index++;
        }
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === inString) inString = null;
        continue;
      }
      if (char === "/" && next === "*") {
        inBlockComment = true;
        index++;
      } else if (char === "/" && next === "/") {
        break;
      } else if (char === '"' || char === "'") {
        inString = char;
      } else if (char === "{") {
        depthChange++;
      } else if (char === "}") {
        if (!firstClosingBrace) {
          indentLevel = Math.max(0, indentLevel - 1);
          firstClosingBrace = true;
        } else {
          depthChange--;
        }
      }
    }

    output.push(`${"    ".repeat(indentLevel)}${trimmed}`);
    indentLevel = Math.max(0, indentLevel + depthChange);
  }

  return output.join("\n");
}

function formatImplementationBody(body: string, language: ProgrammingLanguage) {
  return language === "python"
    ? formatPythonIndentation(body)
    : formatCIndentation(body);
}

/*
 * CodeMirror editor:
 * - one combined editor is displayed
 * - only the official interface and structural C closing brace are protected
 * - helper code above/below and implementation code remain editable
 * - language package supplies real indentation
 */
function FunctionCodeEditor({
  question,
  language,
  implementation,
  disabled,
  onChange,
  onFormatError,
  formatRequest,
}: {
  question: Round2Question | null;
  language: ProgrammingLanguage;
  implementation: string;
  disabled: boolean;
  onChange: (implementation: string) => void;
  onFormatError: (message: string) => void;
  formatRequest: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const languageCompartment = useRef(new Compartment());
  const questionRef = useRef(question);
  const languageRef = useRef(language);
  questionRef.current = question;
  languageRef.current = language;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const programmaticChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onFormatErrorRef = useRef(onFormatError);
  const internalImplementationRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onFormatErrorRef.current = onFormatError;
  }, [onFormatError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const signature =
      getOfficialSignature(question, language) ||
      EMPTY_FUNCTION_MESSAGE[language];

    const initialDocument = buildFunctionDocument(
      question,
      language,
      implementation ?? "",
    );

    const signatureLineText =
      language === "python" ? signature : `${signature} {`;

    const signaturePosition = initialDocument.indexOf(signatureLineText);
    const editableStart =
      signaturePosition >= 0
        ? signaturePosition + signatureLineText.length
        : initialDocument.length;

    /*
     * The cursor starts inside the implementation, but the whole document
     * remains editable except for the protected interface/closing brace.
     */
    const protectedRangesForDocument = (doc: string) => {
      const currentLanguage = languageRef.current;
      const currentSignature =
        getOfficialSignature(questionRef.current, currentLanguage) ||
        EMPTY_FUNCTION_MESSAGE[currentLanguage];
      const currentSignatureLine = currentLanguage === "python"
        ? currentSignature
        : `${currentSignature} {`;
      const lines = doc.split("\n");
      let position = 0;
      let signatureStart = -1;

      for (const line of lines) {
        if (line.trimEnd() === currentSignatureLine) {
          signatureStart = position;
          break;
        }
        position += line.length + 1;
      }

      if (signatureStart < 0) return [];

      const ranges = [
        {
          from: signatureStart,
          to: signatureStart + currentSignatureLine.length,
        },
      ];

      if (currentLanguage !== "python") {
        const signatureLineIndex = lines.findIndex(
          (line) => line.trimEnd() === currentSignatureLine,
        );

        let depth = 1;
        for (let i = signatureLineIndex + 1; i < lines.length; i++) {
          depth += (lines[i].match(/{/g) ?? []).length;
          depth -= (lines[i].match(/}/g) ?? []).length;

          if (depth === 0) {
            let closePosition = 0;
            for (let j = 0; j < i; j++) {
              closePosition += lines[j].length + 1;
            }

            ranges.push({
              from: closePosition,
              to: closePosition + lines[i].length,
            });
            break;
          }
        }
      }

      return ranges;
    };

    const state = EditorState.create({
      doc: initialDocument,
      selection: {
        anchor: Math.min(editableStart, initialDocument.length),
      },
      extensions: [
        basicSetup,
        indentUnit.of("    "),
        indentOnInput(),
        languageCompartment.current.of(createLanguage(language)),

        editableCompartment.current.of([
          EditorView.editable.of(!disabledRef.current),
          EditorState.readOnly.of(disabledRef.current),
        ]),

        EditorView.theme({
          "&": {
            height: "560px",
            backgroundColor: "#0a0f18",
            color: "#e2e8f0",
            cursor: "text",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: "14px",
            lineHeight: "1.65",
            cursor: "text",
          },
          ".cm-content": {
            minHeight: "528px",
            padding: "16px 0",
            color: "#ffffff !important",
            caretColor: "#ffffff",
            cursor: "text",
          },
          ".cm-line": {
            padding: "0 18px",
            color: "#ffffff !important",
            cursor: "text",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "#ffffff !important",
          },
          ".cm-gutters": {
            backgroundColor: "#0a0f18",
            color: "#475569",
            border: "none",
            cursor: "default",
          },
          ".cm-activeLine": {
            backgroundColor: "rgba(255,255,255,0.035)",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "rgba(255,255,255,0.035)",
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: "rgba(34,211,238,0.22) !important",
          },
        }),

        EditorState.changeFilter.of((tr) => {
          if (programmaticChangeRef.current) return true;
          if (!tr.docChanged) return true;

          const protectedRanges = protectedRangesForDocument(
            tr.startState.doc.toString(),
          );

          if (!protectedRanges.length) return true;

          let touchesProtected = false;

          tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            /*
             * Deleting/replacing text:
             * reject whenever the changed old-document range overlaps the
             * protected interface or structural closing brace.
             */
            if (fromA !== toA) {
              if (
                protectedRanges.some(
                  (range) =>
                    fromA < range.to &&
                    toA > range.from,
                )
              ) {
                touchesProtected = true;
              }
              return;
            }

            /*
             * Inserting text:
             * reject insertion anywhere inside the protected range,
             * including exactly at its right edge. Insertion immediately
             * before the interface and immediately after the closing brace
             * remains allowed.
             */
            if (
              protectedRanges.some(
                (range) =>
                  fromA > range.from &&
                  fromA < range.to,
              )
            ) {
              touchesProtected = true;
            }
          });

          return !touchesProtected;
        }),


        EditorView.domEventHandlers({
          keydown(event, view) {
            const key = event.key.toLowerCase();
            const hasCommandModifier = event.ctrlKey || event.metaKey;
            const clipboardShortcut = hasCommandModifier &&
              ["c", "v", "x"].includes(key);
            const legacyClipboardShortcut =
              (event.ctrlKey && key === "insert") ||
              (event.shiftKey && key === "insert") ||
              (event.shiftKey && key === "delete");

            if (clipboardShortcut || legacyClipboardShortcut) {
              event.preventDefault();
              return true;
            }

            if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
              return false;
            }

            const selection = view.state.selection.main;

            // VS Code-like auto-closing pairs for editable code.
            // Typing "{" creates "{}" and keeps the cursor between them.
            // If the cursor is immediately before an existing closing pair,
            // typing the closing character simply moves over it.
            if (selection.empty && ["{", "}", "(", ")", "[", "]"].includes(event.key)) {
              const nextChar = view.state.sliceDoc(selection.head, selection.head + 1);
              const closingPairs: Record<string, string> = {
                "{": "}",
                "(": ")",
                "[": "]",
              };

              if (["}", ")", "]"].includes(event.key) && nextChar === event.key) {
                event.preventDefault();
                view.dispatch({
                  selection: { anchor: selection.head + 1 },
                  userEvent: "input",
                });
                return true;
              }

              const pair = closingPairs[event.key];
              if (pair) {
                event.preventDefault();
                view.dispatch({
                  changes: {
                    from: selection.head,
                    to: selection.head,
                    insert: event.key + pair,
                  },
                  selection: { anchor: selection.head + 1 },
                  userEvent: "input",
                });
                return true;
              }
            }

            if (event.key !== "Enter") {
              return false;
            }

            const enterSelection = view.state.selection.main;
            if (!enterSelection.empty) return false;

            const line = view.state.doc.lineAt(enterSelection.head);
            const column = enterSelection.head - line.from;
            const beforeCursor = line.text.slice(0, column);
            const leadingWhitespace = beforeCursor.match(/^[ \t]*/)?.[0] ?? "";
            const trimmed = beforeCursor.trimEnd();

            let nextIndent = leadingWhitespace.replace(/\t/g, "    ");

            const currentLanguage = languageRef.current;
            if (currentLanguage === "c") {
              if (/\{\s*$/.test(trimmed)) {
                nextIndent += "    ";
              } else if (/^\s*}/.test(trimmed)) {
                nextIndent = nextIndent.slice(0, Math.max(0, nextIndent.length - 4));
              }
            } else if (currentLanguage === "python") {
              if (/:$/.test(trimmed)) {
                nextIndent += "    ";
              }
            }

            const insert = "\n" + nextIndent;
            event.preventDefault();
            view.dispatch({
              changes: { from: enterSelection.head, to: enterSelection.head, insert },
              selection: { anchor: enterSelection.head + insert.length },
              userEvent: "input",
            });
            return true;
          },

          mousedown(event, view) {
            /*
             * Never prevent normal mouse clicks. CodeMirror must receive
             * them so the cursor can move to any line.
             */
            if (event.button === 0) {
              view.focus();
            }
            return false;
          },

          copy(event) {
            event.preventDefault();
            return true;
          },

          cut(event) {
            event.preventDefault();
            return true;
          },

          paste(event) {
            event.preventDefault();
            return true;
          },

          contextmenu(event) {
            event.preventDefault();
            return true;
          },
        }),

        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (programmaticChangeRef.current) return;

          const nextDocument = update.state.doc.toString();

          const nextImplementation = extractImplementation(
            nextDocument,
            questionRef.current,
            languageRef.current,
          );

          internalImplementationRef.current = nextImplementation;
          onChangeRef.current(nextImplementation);
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: host,
    });

    viewRef.current = view;

    /*
     * Put the caret in the editable body, not on the locked signature.
     * This also makes the editor immediately ready for typing.
     */
    requestAnimationFrame(() => {
      view.focus();
      view.dispatch({
        selection: {
          anchor: Math.min(editableStart, view.state.doc.length),
        },
      });
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [question?.question_id]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: languageCompartment.current.reconfigure(createLanguage(language)),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: editableCompartment.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
  }, [disabled]);

  /* Format only the stored implementation body, leaving the official interface untouched. */
  useEffect(() => {
    if (!formatRequest) return;

    const view = viewRef.current;
    if (!view || disabledRef.current) return;

    try {
      const document = view.state.doc.toString();
      const signature = getOfficialSignature(questionRef.current, languageRef.current);
      if (!signature) throw new Error("The predefined function signature is unavailable.");

      const parts = extractEditorParts(
        document,
        questionRef.current,
        languageRef.current,
      );
      const body = normalizeImplementationBody(parts.body);
      if (!body) {
        onFormatErrorRef.current("Nothing to format yet.");
        return;
      }

      const formattedBody = formatImplementationBody(body, languageRef.current);
      if (!formattedBody.trim()) throw new Error("The formatter returned empty code.");

      const formattedImplementation = serializeEditorParts({
        ...parts,
        body: formattedBody,
      });
      const signatureLine = languageRef.current === "python"
        ? signature
        : `${signature} {`;
      const lines = document.split("\n");
      const signatureIndex = lines.findIndex(
        (line) => line.trimEnd() === signatureLine,
      );
      if (signatureIndex < 0) throw new Error("The predefined function signature was not found in the editor.");

      const bodyStart = lines
        .slice(0, signatureIndex + 1)
        .reduce((sum, line) => sum + line.length + 1, 0);
      let bodyEnd = document.length;

      if (languageRef.current === "c") {
        let depth = 1;
        for (let index = signatureIndex + 1; index < lines.length; index++) {
          depth += (lines[index].match(/{/g) ?? []).length;
          depth -= (lines[index].match(/}/g) ?? []).length;
          if (depth === 0) {
            bodyEnd = lines
              .slice(0, index)
              .reduce((sum, line) => sum + line.length + 1, 0);
            break;
          }
        }
        if (depth !== 0) throw new Error("The C function braces are unbalanced.");
      } else {
        const endIndex = findPythonFunctionEnd(lines, signatureIndex);
        bodyEnd = lines
          .slice(0, endIndex)
          .reduce((sum, line) => sum + line.length + 1, 0);
      }

      const replacement = `${indentImplementationForEditor(formattedBody)}\n`;
      const oldSelection = view.state.selection.main;
      const bodyOffset = Math.max(0, oldSelection.head - bodyStart);
      const nextBodyEnd = bodyStart + replacement.length;
      const nextCursor = Math.min(bodyStart + bodyOffset, nextBodyEnd);

      if (document.slice(bodyStart, bodyEnd) === replacement) return;

      programmaticChangeRef.current = true;
      internalImplementationRef.current = formattedImplementation;
      view.dispatch({
        changes: {
          from: bodyStart,
          to: bodyEnd,
          insert: replacement,
        },
        selection: { anchor: nextCursor },
        userEvent: "input.format",
      });
      onChangeRef.current(formattedImplementation);
    } catch (error) {
      console.error("Unable to format code:", error);
      onFormatErrorRef.current("Unable to format code.");
    } finally {
      programmaticChangeRef.current = false;
    }
  }, [formatRequest]);

  /*
   * Synchronize external saved-code changes.
   *
   * Do not rebuild the document when the same text is already in the editor.
   * This is important because rebuilding on every React render can make the
   * cursor appear stuck.
   */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Changes originating from this editor are already present in CodeMirror.
    // Do not rebuild the document immediately after every keystroke; doing so
    // destroys the just-created blank line/caret position (especially after Enter).
    if (internalImplementationRef.current === (implementation ?? "")) {
      internalImplementationRef.current = null;
      return;
    }

    const nextDocument = buildFunctionDocument(
      question,
      language,
      implementation ?? "",
    );

    if (view.state.doc.toString() === nextDocument) return;

    const signature =
      getOfficialSignature(question, language) ||
      EMPTY_FUNCTION_MESSAGE[language];

    const signatureLineText =
      language === "python" ? signature : `${signature} {`;
    const signaturePosition = nextDocument.indexOf(signatureLineText);
    const editableStart =
      signaturePosition >= 0
        ? signaturePosition + signatureLineText.length
        : nextDocument.length;

    const current = view.state.selection.main;
    const clamp = (position: number) =>
      Math.max(0, Math.min(position, nextDocument.length));

    programmaticChangeRef.current = true;
    try {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextDocument,
        },
        selection: {
          anchor: clamp(current.anchor),
          head: clamp(current.head),
        },
      });
    } finally {
      programmaticChangeRef.current = false;
    }
  }, [implementation, question, language]);

  return (
    <div
      ref={hostRef}
      className={`overflow-hidden rounded-b-xl border-t border-white/10 ${
        disabled ? "opacity-60" : ""
      }`}
      data-readonly={disabled}
      style={{
        pointerEvents: "auto",
        userSelect: "text",
        WebkitUserSelect: "text",
      }}
      aria-disabled={disabled}
      aria-readonly={disabled}
    />
  );
}

function getReturnInstruction(config: Round2JudgeConfig | null) {
  if (!config) {
    return {
      title: "Return behavior",
      message: "Loading the question's return behavior...",
    };
  }

  if (config.result_mode === "MUTATED_ARGUMENT") {
    return {
      title: "Return required: No",
      message: config.target
        ? `Modify ${config.target} in place.`
        : "Modify the required input argument in place.",
    };
  }

  if (config.result_mode === "RETURN_VALUE_AND_MUTATION") {
    return {
      title: `Return required: Yes${config.return_type ? ` — ${config.return_type}` : ""}`,
      message: config.target
        ? `Return the required value and update ${config.target} as specified.`
        : "Return the required value.",
    };
  }

  if (config.return_required === false) {
    return {
      title: "Return required: No",
      message: config.target
        ? `Modify ${config.target} in place.`
        : "Modify the required input in place.",
    };
  }

  return {
    title: `Return required: Yes${config.return_type ? ` — ${config.return_type}` : ""}`,
    message: "Return the answer from the predefined function.",
  };
}

export function DashboardPage() {
  const { user, profile } = useAuth();

  const [team, setTeam] = useState<Team | null>(null);
  const [round2Session, setRound2Session] =
    useState<Round2Session | null>(null);
  const round2SessionRef = useRef<Round2Session | null>(null);
  const sessionRequestSequenceRef = useRef(0);
  const [round2Question, setRound2Question] =
    useState<Round2Question | null>(null);

  const [judgeConfig, setJudgeConfig] =
    useState<Round2JudgeConfig | null>(null);
  const [visibleTests, setVisibleTests] =
    useState<Round2VisibleTest[]>([]);
  const [loadedCodeStageKey, setLoadedCodeStageKey] =
    useState<string | null>(null);

  const [remainingSeconds, setRemainingSeconds] =
    useState<number | null>(null);
  const remainingSecondsRef = useRef<number | null>(null);
  const expiredCodingStageKeyRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [language, setLanguage] =
    useState<ProgrammingLanguage>("c");
  const [code, setCode] = useState("");
  const codeRef = useRef("");

  const [codeLoading, setCodeLoading] = useState(false);
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeSaveMessage, setCodeSaveMessage] =
    useState<string | null>(null);
  const [codeError, setCodeError] =
    useState<string | null>(null);

  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeRunResult, setCodeRunResult] =
    useState<CodeRunResult | null>(null);
  const [selectedResultCase, setSelectedResultCase] =
    useState(1);

  const [formatRequest, setFormatRequest] = useState(0);

  const [submittedSnapshot, setSubmittedSnapshot] =
    useState<SubmissionSnapshot | null>(null);
  const [submissionDirty, setSubmissionDirty] = useState(false);

  const submissionStorageKey = useMemo(() => {
    if (!team || !round2Session || !round2Question) return null;
    return `coderelay-round2-last-submission-${team.id}-${round2Session.id}-${round2Question.question_id}`;
  }, [team?.id, round2Session?.id, round2Question?.question_id]);

  // Keep the submitted status visible after refresh. During the initial
  // editor hydration, CodeMirror may briefly trigger the change handler and
  // mark the submission dirty even though the code has not actually changed.
  // Treat the submission as active when the editor still exactly matches the
  // submitted snapshot. A real edit, clear, or language change will make it
  // inactive.
  const currentSubmissionIsActive = Boolean(
    submittedSnapshot &&
      (
        !submissionDirty ||
        (
          codeRef.current === submittedSnapshot.code &&
          language === submittedSnapshot.language
        )
      ),
  );


  const loadTeam = useCallback(async () => {
    if (!user) return null;

    const result = await insforge.database.rpc(
      "get_round2_team_for_current_user",
    );

    if (result.error) throw result.error;

    const rows = (result.data as Team[]) ?? [];
    const current = rows[0] ?? null;
    setTeam(current);
    return current;
  }, [user]);

  const loadRound2Session = useCallback(async () => {
    const requestSequence = ++sessionRequestSequenceRef.current;

    // Use the student-safe RPC instead of relying on direct SELECT RLS.
    // This is what makes an already-open Student 2 dashboard see an
    // administrator's phase change without a page refresh.
    const result = await insforge.database.rpc(
      "get_round2_session_for_current_user",
    );

    if (result.error) throw result.error;
    if (requestSequence !== sessionRequestSequenceRef.current) {
      return round2SessionRef.current;
    }

    const rows = (result.data as Round2Session[]) ?? [];
    const active = rows[0] ?? null;
    const previous = round2SessionRef.current;

    if (previous && active) {
      const sameSession = previous.id === active.id;
      const previousVersion = Date.parse(
        sameSession ? previous.updated_at : previous.created_at,
      );
      const activeVersion = Date.parse(
        sameSession ? active.updated_at : active.created_at,
      );

      if (
        Number.isFinite(previousVersion) &&
        Number.isFinite(activeVersion) &&
        activeVersion < previousVersion
      ) {
        return previous;
      }
    }

    const unchanged = areRound2SessionsEqual(
      previous,
      active,
    );
    if (active?.phase === "QUESTION" || active?.phase === "CODING") {
      void syncServerTime();
    }
    round2SessionRef.current = active;
    if (!unchanged) setRound2Session(active);
    return active;
  }, []);

  const loadTeamQuestion = useCallback(
    async (currentTeam: Team | null) => {
      if (!currentTeam) {
        setRound2Question(null);
        return null;
      }

      const result = await insforge.database.rpc(
        "get_round2_question_for_team",
        { p_team_id: currentTeam.id },
      );

      if (result.error) throw result.error;

      const rows = (result.data as Round2Question[]) ?? [];
      const question = rows[0] ?? null;
      setRound2Question(question);
      return question;
    },
    [],
  );

  const loadRound2CodingData = useCallback(
    async (question: Round2Question | null) => {
      if (!question?.question_id) {
        setJudgeConfig(null);
        return;
      }

      try {
        const judgeResult = await insforge.database.rpc(
          "get_round2_judge_config",
          { p_question_id: question.question_id },
        );

        if (judgeResult.error) throw judgeResult.error;

        const judgeRows =
          (judgeResult.data as Round2JudgeConfig[]) ?? [];

        setJudgeConfig(judgeRows[0] ?? null);
      } catch (err) {
        console.error(
          "Unable to load Round 2 coding configuration:",
          err,
        );
        setJudgeConfig(null);
        setCodeError("Unable to load the coding instructions.");
      }
    },
    [],
  );

  /* The coding instruction is read from InsForge. */
  useEffect(() => {
    void loadRound2CodingData(round2Question);
  }, [round2Question?.question_id, loadRound2CodingData]);

  useEffect(() => {
    if (
      round2Session?.phase !== "CODING" ||
      round2Session.coding_stage !== "STUDENT_3" ||
      !round2Question?.question_id
    ) {
      setVisibleTests([]);
      return;
    }

    let cancelled = false;
    const loadVisibleTests = async () => {
      try {
        const result = await insforge.database.rpc(
          "get_round2_visible_tests",
          { p_question_id: round2Question.question_id },
        );
        if (result.error) throw result.error;
        if (cancelled) return;

        setVisibleTests(
          ((result.data as Round2VisibleTest[]) ?? []).slice(0, 2),
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Unable to load visible Round 2 tests:", err);
          setVisibleTests([]);
        }
      }
    };

    void loadVisibleTests();
    return () => {
      cancelled = true;
    };
  }, [
    round2Session?.id,
    round2Session?.phase,
    round2Session?.coding_stage,
    round2Question?.question_id,
  ]);

  const loadTeamCode = useCallback(
    async (
      currentTeam: Team | null,
      currentSession: Round2Session | null,
      currentQuestion: Round2Question | null,
    ) => {
      if (!currentTeam || !currentSession || !currentQuestion) return;

      setCodeLoading(true);
      setCodeError(null);
      setLoadedCodeStageKey(null);

      try {
        const result = await insforge.database.rpc(
          "get_round2_team_code_for_member",
          {
            p_session_id: currentSession.id,
            p_team_id: currentTeam.id,
            p_question_id: currentQuestion.question_id,
          },
        );

        if (result.error) throw result.error;

        const rows = (result.data as TeamCode[]) ?? [];
        const saved = rows[0] ?? null;

        if (!saved) {
          setCode("");
          codeRef.current = "";
          setLoadedCodeStageKey(
            `${currentSession.id}:${currentSession.coding_stage ?? "STUDENT_2"}:${currentQuestion.question_id}`,
          );
          return;
        }

        const savedLanguage =
          saved.language === "python" || saved.language === "c"
            ? saved.language
            : "c";

        setLanguage(savedLanguage);
        setCode(saved.code ?? "");
        codeRef.current = saved.code ?? "";
        setLoadedCodeStageKey(
          `${currentSession.id}:${currentSession.coding_stage ?? "STUDENT_2"}:${currentQuestion.question_id}`,
        );
      } catch (err) {
        console.error("Unable to load saved code:", err);
        setCodeError("Unable to load your saved code.");
      } finally {
        setCodeLoading(false);
      }
    },
    [],
  );

  const loadDashboard = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const currentTeam = await loadTeam();
      await loadRound2Session();
      await loadTeamQuestion(currentTeam);
    } catch (err) {
      console.error("Dashboard loading failed:", err);
      setError("Something went wrong while loading your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [
    user,
    loadTeam,
    loadRound2Session,
    loadTeamQuestion,
  ]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!submissionStorageKey) {
      setSubmittedSnapshot(null);
      setSubmissionDirty(false);
      return;
    }

    try {
      const raw = window.localStorage.getItem(submissionStorageKey);
      if (!raw) {
        setSubmittedSnapshot(null);
        setSubmissionDirty(false);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<SubmissionSnapshot>;
      if (
        (parsed.status === "SOLVED" || parsed.status === "ATTEMPTED" || parsed.status === "SUBMITTED") &&
        typeof parsed.code === "string" &&
        (parsed.language === "c" ||
          parsed.language === "python")
      ) {
        setSubmittedSnapshot({
          code: parsed.code,
          language: parsed.language,
          status: parsed.status,
          submitted_at:
            typeof parsed.submitted_at === "string"
              ? parsed.submitted_at
              : new Date().toISOString(),
          ...(typeof parsed.score === "number" ? { score: parsed.score } : {}),
          ...(typeof parsed.max_score === "number" ? { max_score: parsed.max_score } : {}),
          ...(typeof parsed.passed_cases === "number" ? { passed_cases: parsed.passed_cases } : {}),
          ...(typeof parsed.total_cases === "number" ? { total_cases: parsed.total_cases } : {}),
          ...(typeof parsed.failed_cases === "number" ? { failed_cases: parsed.failed_cases } : {}),
        });
        setSubmissionDirty(false);
      } else {
        setSubmittedSnapshot(null);
        setSubmissionDirty(false);
      }
    } catch {
      setSubmittedSnapshot(null);
      setSubmissionDirty(false);
    }
  }, [submissionStorageKey]);

  /*
   * Initial editor hydration can fire a normal editor-change callback while
   * the saved code is being restored. If that code is exactly the submitted
   * snapshot, it is not a real edit, so keep the submission active.
   *
   * If the student actually changes the code or language, the comparison
   * fails and submissionDirty remains true, hiding the old submitted badge.
   */
  useEffect(() => {
    if (!submissionStorageKey || !submittedSnapshot || codeLoading) return;

    const editorMatchesSubmission =
      codeRef.current === submittedSnapshot.code &&
      language === submittedSnapshot.language;

    if (editorMatchesSubmission) {
      setSubmissionDirty(false);
    }
  }, [
    submissionStorageKey,
    submittedSnapshot,
    codeLoading,
    code,
    language,
  ]);

  /*
   * LIVE RELAY SYNC
   *
   * Keep the already-open student dashboard synchronized with the admin
   * session. The browser does not need to refresh or navigate.
   *
   * 1. Admin changes round2_sessions in InsForge.
   * 2. This poll sees the new phase/coding_stage.
   * 3. React updates round2Session immediately.
   * 4. The stage effect below loads Student 2/3 code when the stage changes.
   */
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let timeout: number | undefined;

    const sync = async () => {
      try {
        await loadRound2Session();
      } catch (err) {
        if (!cancelled) {
          console.error("Live Round 2 sync failed:", err);
        }
      } finally {
        if (!cancelled) {
          timeout = window.setTimeout(() => void sync(), 500);
        }
      }
    };

    void sync();

    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [
    user,
    loadRound2Session,
  ]);

  /*
   * Load code only when the session actually enters CODING.
   */
  const previousPhase = useRef<Round2Phase | null>(null);
  const previousCodingStage = useRef<string | null>(null);

  useEffect(() => {
    if (!team || !round2Session || !round2Question) return;

    const stage = round2Session.coding_stage ?? "STUDENT_2";
    const enteredCoding =
      round2Session.phase === "CODING" &&
      (previousPhase.current !== "CODING" || previousCodingStage.current !== stage);

    if (enteredCoding && round2Session.phase === "CODING") {
      void loadTeamCode(team, round2Session, round2Question);
    }

    previousPhase.current = round2Session.phase;
    previousCodingStage.current = stage;
  }, [
    team?.id,
    round2Session?.id,
    round2Session?.phase,
    round2Session?.coding_stage,
    round2Question?.question_id,
    loadTeamCode,
  ]);

  useEffect(() => {
    if (
      !round2Session ||
      (round2Session.phase !== "QUESTION" &&
        round2Session.phase !== "CODING")
    ) {
      expiredCodingStageKeyRef.current = null;
      remainingSecondsRef.current = null;
      setRemainingSeconds(null);
      return;
    }

    if (!round2Session.phase_started_at) {
      const nextRemaining = round2Session.phase === "CODING" ? 0 : null;
      if (round2Session.phase === "CODING") {
        expiredCodingStageKeyRef.current =
          `${round2Session.id}:${round2Session.coding_stage ?? "STUDENT_2"}:missing`;
      }
      remainingSecondsRef.current = nextRemaining;
      setRemainingSeconds(nextRemaining);
      return;
    }

    void syncServerTime();

    const update = () => {
      const start =
        new Date(round2Session.phase_started_at!).getTime();
      const elapsed = Math.floor((getServerNow() - start) / 1000);

      const codingStage =
        round2Session.coding_stage ?? "STUDENT_2";

      const base =
        round2Session.phase === "QUESTION"
          ? Number(round2Session.question_duration_seconds)
          : codingStage === "STUDENT_3"
            ? Number(round2Session.student3_duration_seconds)
            : Number(round2Session.coding_duration_seconds);

      const extension =
        round2Session.phase === "QUESTION"
          ? Number(round2Session.question_extension_seconds ?? 0)
          : codingStage === "STUDENT_3"
            ? Number(round2Session.student3_extension_seconds ?? 0)
            : Number(round2Session.coding_extension_seconds ?? 0);

      const total = base + extension;
      let nextRemaining = Number.isFinite(start) && Number.isFinite(total)
        ? Math.max(0, total - elapsed)
        : 0;

      if (round2Session.phase === "CODING") {
        const stageKey = `${round2Session.id}:${codingStage}:${round2Session.phase_started_at}`;
        if (nextRemaining <= 0 || expiredCodingStageKeyRef.current === stageKey) {
          if (nextRemaining <= 0) {
            expiredCodingStageKeyRef.current = stageKey;
            nextRemaining = 0;
          } else {
            expiredCodingStageKeyRef.current = null;
          }
        }
      } else {
        expiredCodingStageKeyRef.current = null;
      }

      remainingSecondsRef.current = nextRemaining;
      setRemainingSeconds(nextRemaining);
    };

    update();

    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [
    round2Session?.phase,
    round2Session?.phase_started_at,
    round2Session?.question_duration_seconds,
    round2Session?.coding_duration_seconds,
    round2Session?.student3_duration_seconds,
    round2Session?.coding_stage,
    round2Session?.question_extension_seconds,
    round2Session?.coding_extension_seconds,
    round2Session?.student3_extension_seconds,
    round2Session?.phase_extension_seconds,
  ]);

  const formattedTime = useMemo(() => {
    if (remainingSeconds === null) return "--:--";

    return `${String(
      Math.floor(remainingSeconds / 60),
    ).padStart(2, "0")}:${String(
      remainingSeconds % 60,
    ).padStart(2, "0")}`;
  }, [remainingSeconds]);

  const codingTimeExpired =
    round2Session?.phase === "CODING" &&
    (remainingSeconds === null || remainingSeconds <= 0);

  const saveCode = useCallback(
    async (
      nextCode: string = codeRef.current,
      nextLanguage: ProgrammingLanguage = language,
    ) => {
      if (
        !user ||
        !team ||
        !round2Session ||
        !round2Question ||
        codingTimeExpired ||
        round2Session.phase !== "CODING" ||
        !["STUDENT_2", "STUDENT_3"].includes(
          round2Session.coding_stage ?? "STUDENT_2",
        ) ||
        remainingSecondsRef.current === null ||
        remainingSecondsRef.current <= 0
      ) {
        return;
      }

      setCodeSaving(true);
      setCodeSaveMessage(null);
      setCodeError(null);

      try {
        const result = await insforge.database.rpc(
          "save_round2_team_code_for_member",
          {
            p_session_id: round2Session.id,
            p_team_id: team.id,
            p_question_id: round2Question.question_id,
            p_language: nextLanguage,
            p_code: nextCode,
          },
        );

        if (result.error) throw result.error;

        setCodeSaveMessage("Saved");
      } catch (err) {
        console.error("Unable to save code:", err);
        setCodeError(
          err instanceof Error
            ? err.message
            : "Unable to save your code.",
        );
      } finally {
        setCodeSaving(false);
      }
    },
    [
      user,
      team,
      round2Session,
      round2Question,
      language,
      codingTimeExpired,
    ],
  );

  useEffect(() => {
    if (
      !team ||
      !round2Session ||
      !round2Question ||
      round2Session.phase !== "CODING" ||
      codingTimeExpired ||
      codeLoading ||
      remainingSecondsRef.current === null ||
      remainingSecondsRef.current <= 0
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCode(codeRef.current, language);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    code,
    language,
    team,
    round2Session,
    round2Question,
    codeLoading,
    saveCode,
    codingTimeExpired,
  ]);

  const handleEditorChange = useCallback((nextImplementation: string) => {
    if (
      codingTimeExpired ||
      round2SessionRef.current?.phase !== "CODING" ||
      remainingSecondsRef.current === null ||
      remainingSecondsRef.current <= 0
    ) {
      return;
    }

    codeRef.current = nextImplementation;
    setCode(nextImplementation);
    setSubmissionDirty(true);
    setCodeSaveMessage(null);
    setCodeError(null);
    setCodeRunResult(null);
  }, [codingTimeExpired]);

  const handleLanguageChange = (
    nextLanguage: ProgrammingLanguage,
  ) => {
    if (
      codingTimeExpired ||
      !canEditCode ||
      remainingSecondsRef.current === null ||
      remainingSecondsRef.current <= 0
    ) {
      return;
    }
    if (nextLanguage === language) return;

    setLanguage(nextLanguage);
    setSubmissionDirty(true);
    setCodeSaveMessage(null);
    setCodeError(null);
    setCodeRunResult(null);
  };

  const handleClearCode = () => {
    if (codingTimeExpired || !canUseCodingTools) return;
    if (isRunningCode || codeSaving || codeLoading) return;

    setSubmissionDirty(true);
    codeRef.current = "";
    setCode("");
    setCodeSaveMessage("Editor cleared");
    setCodeError(null);
    setCodeRunResult(null);
    setSelectedResultCase(1);
  };

  const handleFormatCode = () => {
    if (codingTimeExpired || !canUseCodingTools) return;
    if (isRunningCode || codeLoading) return;

    setCodeSaveMessage(null);
    setCodeError(null);
    setFormatRequest((value) => value + 1);
  };

  const handleRestoreSubmittedCode = () => {
    if (codingTimeExpired || !canUseCodingTools) return;
    if (isRunningCode || codeSaving || codeLoading) return;

    let snapshot = submittedSnapshot;

    // Re-read storage on click so Restore also works if React state has not
    // finished hydrating yet after a refresh.
    if (!snapshot && submissionStorageKey) {
      try {
        const raw = window.localStorage.getItem(submissionStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SubmissionSnapshot>;
          if (
            (parsed.status === "SOLVED" || parsed.status === "ATTEMPTED" || parsed.status === "SUBMITTED") &&
            typeof parsed.code === "string" &&
            (parsed.language === "c" || parsed.language === "python")
          ) {
            snapshot = {
              code: parsed.code,
              language: parsed.language,
              status: parsed.status,
              submitted_at:
                typeof parsed.submitted_at === "string"
                  ? parsed.submitted_at
                  : new Date().toISOString(),
            };
            setSubmittedSnapshot(snapshot);
          }
        }
      } catch {
        // Keep the normal error below.
      }
    }

    if (!snapshot) {
      setCodeError("No previously submitted code is available to restore.");
      return;
    }

    setLanguage(snapshot.language);
    codeRef.current = snapshot.code;
    setCode(snapshot.code);
    setSubmissionDirty(false);
    setCodeSaveMessage("Restored last submitted code");
    setCodeError(null);
    setCodeRunResult(null);
    setSelectedResultCase(1);
  };

  const handleSubmitCode = async () => {
    if (codingTimeExpired || !canUseCodingTools) return;

    if (
      !user ||
      !team ||
      !round2Session ||
      !round2Question ||
      round2Session.phase !== "CODING" ||
      remainingSecondsRef.current === null ||
      remainingSecondsRef.current <= 0
    ) {
      return;
    }

    if (!codeRef.current.trim()) {
      setCodeError("Write an implementation before submitting.");
      return;
    }

    if (isRunningCode || codeSaving || codeLoading) return;

    setIsRunningCode(true);
    setCodeError(null);
    setCodeSaveMessage(null);

    try {
      // Submit performs a fresh server-side full test run. This is the only
      // request that creates/updates the official 30-mark result.
      const result = await insforge.functions.invoke(
        "run-round2-code",
        {
          body: {
            session_id: round2Session.id,
            team_id: team.id,
            question_id: round2Question.question_id,
            language,
            implementation: codeRef.current,
            final_submission: true,
          },
        },
      );

      if (result.error) {
        const functionError = result.error as {
          message?: string;
          details?: unknown;
          code?: string;
        };

        throw new Error(
          [
            functionError.message ?? "Final submission failed.",
            functionError.code ? `Code: ${functionError.code}` : "",
            functionError.details
              ? JSON.stringify(functionError.details)
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
        );
      }

      const finalRun = result.data as CodeRunResult;

      // The server intentionally does NOT return marks to Student 3.
      // It only returns a persistence confirmation after the official
      // result has been stored and verified in round2_final_results.
      if (
        finalRun.final_submission !== true ||
        finalRun.final_result_saved !== true
      ) {
        throw new Error(
          "Submission was judged, but the marks were not confirmed as saved by the server.",
        );
      }

      setCodeRunResult(null);

      const snapshot: SubmissionSnapshot = {
        code: codeRef.current,
        language,
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
      };

      if (submissionStorageKey) {
        window.localStorage.setItem(
          submissionStorageKey,
          JSON.stringify(snapshot),
        );
      }

      setSubmittedSnapshot(snapshot);
      setSubmissionDirty(false);
      setCodeSaveMessage(
        "Submission received successfully. Your code and marks have been submitted to the admin.",
      );
      setCodeError(null);
    } catch (err) {
      console.error("Final submission failed:", err);
      setCodeError(
        err instanceof Error
          ? err.message
          : "Unable to submit your code.",
      );
    } finally {
      setIsRunningCode(false);
    }
  };

  const handleRunCode = async () => {
    if (codingTimeExpired || !canUseCodingTools) return;
    if (
      !user ||
      !team ||
      !round2Session ||
      !round2Question ||
      round2Session.phase !== "CODING" ||
      remainingSecondsRef.current === null ||
      remainingSecondsRef.current <= 0
    ) {
      return;
    }

    if (!codeRef.current.trim()) {
      setCodeError("Write an implementation before running the code.");
      return;
    }

    if (isRunningCode) return;

    setIsRunningCode(true);
    setCodeError(null);
    setCodeSaveMessage(null);
    setCodeRunResult(null);
    setSelectedResultCase(1);

    try {
      await saveCode(codeRef.current, language);

      if (
        remainingSecondsRef.current === null ||
        remainingSecondsRef.current <= 0
      ) {
        return;
      }

      const result = await insforge.functions.invoke(
        "run-round2-code",
        {
          body: {
            session_id: round2Session.id,
            team_id: team.id,
            question_id: round2Question.question_id,
            language,
            implementation: codeRef.current,
            final_submission: false,
          },
        },
      );

      if (result.error) {
        const functionError = result.error as {
          message?: string;
          details?: unknown;
          code?: string;
        };

        throw new Error(
          [
            functionError.message ?? "Code execution failed.",
            functionError.code
              ? `Code: ${functionError.code}`
              : "",
            functionError.details
              ? JSON.stringify(functionError.details)
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
        );
      }

      const run = result.data as CodeRunResult;
      setCodeRunResult({
        status: run.status,
        visible_cases: run.visible_cases?.slice(0, 2),
      });

      if (run.status === "COMPLETED") {
        setCodeSaveMessage("Accepted — all configured tests passed.");
      } else if (run.status === "WRONG_ANSWER") {
        setCodeSaveMessage("Wrong Answer — one or more tests failed.");
      } else {
        setCodeSaveMessage(`Run finished: ${run.status}`);
      }
    } catch (err) {
      console.error("Run failed:", err);
      setCodeError(
        err instanceof Error
          ? err.message
          : "Unable to execute the code.",
      );
    } finally {
      setIsRunningCode(false);
    }
  };

  const returnInstruction =
    useMemo(
      () => getReturnInstruction(judgeConfig),
      [judgeConfig],
    );

  const codingStage = round2Session?.coding_stage ?? "STUDENT_2";
  const isStudent2Coding =
    round2Session?.phase === "CODING" &&
    round2Session.coding_stage === "STUDENT_2";
  const isStudent3Coding =
    round2Session?.phase === "CODING" &&
    codingStage === "STUDENT_3";
  const isStudent1 = Boolean(user && team && team.created_by === user.id);
  /*
   * CodeRelay uses a single-laptop relay for Round 2. The authenticated
   * account is the team creator (Student 1 account), while Students 2 and 3
   * physically take turns at the same dashboard. Therefore coding access
   * must follow the server-controlled coding_stage, not the authenticated
   * user's profile identity.
   *
   * The stage determines the physical turn. Only Student 3 receives coding
   * action controls; both stages are locked when the session timer expires.
   */
  const canEditCode =
    round2Session?.phase === "CODING" &&
    (codingStage === "STUDENT_2" || codingStage === "STUDENT_3") &&
    !codingTimeExpired;
  const canUseCodingTools = canEditCode && codingStage === "STUDENT_3";
  const activeCodeStageKey = round2Session && round2Question
    ? `${round2Session.id}:${codingStage}:${round2Question.question_id}`
    : null;
  const sharedCodeReady = loadedCodeStageKey === activeCodeStageKey;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
            <p className="text-sm text-slate-500">
              Loading your CodeRelay dashboard...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        {!isStudent2Coding && <header className="mb-8">
          <p className="text-sm font-medium text-cyan-400">
            CodeRelay Competition
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Student Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {profile?.full_name
              ? `Welcome, ${profile.full_name}.`
              : "Welcome to CodeRelay."}
          </p>
        </header>}

        {!isStudent2Coding && error && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!isStudent2Coding && team && (
          <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Your Team
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  Team #{team.team_number} — {team.team_name}
                </h2>
              </div>
              <div className="text-sm text-slate-400">
                {team.student_1_name} • {team.student_2_name} •{" "}
                {team.student_3_name}
              </div>
            </div>
          </section>
        )}

        {!round2Session && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <h2 className="text-xl font-semibold">
              Round 2 has not started
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Please wait for the administrator.
            </p>
          </section>
        )}

        {round2Session?.phase === "CONFIGURED" && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-xs uppercase tracking-wider text-cyan-400">
              Ready
            </p>
            <h2 className="mt-2 text-2xl font-bold">Get Ready</h2>
            <p className="mt-2 text-sm text-slate-500">
              Wait for the administrator to start the question.
            </p>
          </section>
        )}

        {round2Session?.phase === "QUESTION" && (
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Student 1 · Explain
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  {round2Question?.title ?? "Assigned Question"}
                </h2>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-center">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Time
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-cyan-300">
                  {formattedTime}
                </p>
              </div>
            </div>

            {isStudent1 && round2Question && remainingSeconds !== 0 ? (
              <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-5">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
                  {round2Question.question_text}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-8 text-center">
                <p className="font-semibold">
                  Student 2 and Student 3 are waiting.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Only Student 1 sees the question during this phase.
                </p>
              </div>
            )}
          </section>
        )}

        {round2Session?.phase === "TRANSITION" && (
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              QUESTION TIME OVER
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              Students Are Locked
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Wait for the administrator to continue to the editor.
            </p>
          </section>
        )}

        {round2Session?.phase === "CODING" && round2Question && (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                {isStudent3Coding ? "STUDENT 3 · CODING" : "STUDENT 2 · CODING"}
              </p>
              <div className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-center">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Coding Time
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-cyan-300">
                  {formattedTime}
                </p>
              </div>
            </div>

            {isStudent3Coding && (
              <div className="border-b border-white/10 bg-black/10 p-5">
                <h2 className="text-xl font-bold text-white">{round2Question.title}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                  {round2Question.question_text}
                </p>
                <div className="mt-4 inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2">
                  <p className="text-xs font-semibold text-cyan-300">
                    {returnInstruction.title}
                  </p>
                  <p className="text-xs text-slate-400">
                    {returnInstruction.message}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-b border-white/10 bg-black/20 px-4 py-3">
              {(Object.keys(LANGUAGE_LABELS) as ProgrammingLanguage[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleLanguageChange(item)}
                  disabled={
                    !canEditCode ||
                    codeLoading ||
                    !sharedCodeReady
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    language === item
                      ? "bg-cyan-400 text-slate-950"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {LANGUAGE_LABELS[item]}
                </button>
              ))}
            </div>

            {codeSaving || codeSaveMessage === "Saved" ? (
              <p className="border-b border-white/10 px-4 py-2 text-xs text-slate-400" role="status">
                {codeSaving ? "Saving..." : "Saved"}
              </p>
            ) : null}

            <div className="relative">
              {(!sharedCodeReady || codeLoading) && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/80">
                  <p className="text-sm text-slate-400">Loading saved code...</p>
                </div>
              )}
              <FunctionCodeEditor
                question={round2Question}
                language={language}
                implementation={code}
                disabled={!canEditCode || codingTimeExpired || codeLoading || !sharedCodeReady}
                onChange={handleEditorChange}
                onFormatError={setCodeError}
                formatRequest={formatRequest}
              />
            </div>

            {isStudent3Coding && (
              <>
            <section className="grid gap-3 border-t border-white/10 p-4 lg:grid-cols-2">
              {visibleTests.slice(0, 2).map((test, index) => {
                const result = codeRunResult?.visible_cases?.find(
                  (item) => item.case_number === index + 1,
                );

                return (
                  <article key={test.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <h3 className="text-sm font-semibold text-cyan-300">
                      Test Case {index + 1}
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Input</p>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{formatTestInput(test.input_data)}</pre>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expected Output</p>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{formatTestOutput(test.expected_output)}</pre>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actual / Generated Output</p>
                        <pre className="mt-1 min-h-5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{result ? formatTestOutput(result.output) : ""}</pre>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            {currentSubmissionIsActive && (
              <div className="border-t border-white/10 bg-black/10 px-4 py-3" role="status">
                <p className="text-sm font-semibold text-emerald-300">
                  <span className="block">Submission received successfully.</span>
                  <span className="block">Your code and marks have been submitted to the admin.</span>
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
              <p className="text-xs text-slate-400" role="status">
                {codeError ?? (codeSaving ? "Saving..." : codeSaveMessage ?? "")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleClearCode}
                  disabled={!canUseCodingTools || isRunningCode || codeSaving || codeLoading || !sharedCodeReady}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ActionIcon name="clear" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleFormatCode}
                  disabled={!canUseCodingTools || isRunningCode || codeLoading || !code.trim() || !sharedCodeReady}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ActionIcon name="format" />
                  Format
                </button>
                <button
                  type="button"
                  onClick={handleRestoreSubmittedCode}
                  disabled={!canUseCodingTools || isRunningCode || codeSaving || codeLoading || !submittedSnapshot || !sharedCodeReady}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ActionIcon name="restore" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => void saveCode(codeRef.current, language)}
                  disabled={!canUseCodingTools || codeSaving || codeLoading || !sharedCodeReady}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ActionIcon name="save" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunCode()}
                  disabled={!canUseCodingTools || isRunningCode || codeLoading || !code.trim() || !sharedCodeReady}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ActionIcon name="run" />
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitCode()}
                  disabled={!canUseCodingTools || isRunningCode || codeSaving || codeLoading || !code.trim() || !sharedCodeReady}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ActionIcon name="submit" />
                  Submit
                </button>
              </div>
            </div>
              </>
            )}
          </section>
        )}

        {round2Session?.phase === "ENDED" && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-xl font-semibold">Round 2 Ended</p>
            <p className="mt-2 text-sm text-slate-500">
              This round has finished.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
