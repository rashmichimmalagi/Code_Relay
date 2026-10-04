/*
 * CodeRelay Round 2 - secure server judge
 *
 * IMPORTANT:
 * - This file intentionally uses plain JavaScript syntax inside a .ts file.
 * - There is NO SDK import. It talks to InsForge through its HTTP API.
 * - This avoids dashboard parser/import problems and keeps the function
 *   directly deployable as an InsForge Edge Function.
 *
 * Required secrets:
 *   JUDGE0_URL
 *   JUDGE0_AUTH_TOKEN   (optional if your Judge0 instance does not require it)
 *   API_KEY             (InsForge project API key; server-side only)
 *
 * Required InsForge env:
 *   INSFORGE_URL
 *
 * Request body:
 * {
 *   "session_id": "...",
 *   "team_id": "...",
 *   "question_id": "...",
 *   "language": "c" | "python",
 *   "implementation": "...",
 *   "final_submission": false
 * }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LANGUAGE_IDS = {
  c: 50,
  python: 71,
};

const EDITOR_STORAGE_PREFIX = "__CODERELAY_EDITOR_V1__";

function cleanRound2Code(rawCode) {
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
      );

      if (parsed && typeof parsed === "object") {
        const before = typeof parsed.before === "string" ? parsed.before : "";
        const body = typeof parsed.body === "string" ? parsed.body : "";
        const after = typeof parsed.after === "string" ? parsed.after : "";

        if (before.trim() || after.trim()) {
          const parts = [];
          if (before.trim()) parts.push(before);
          if (body) parts.push(body);
          if (after.trim()) parts.push(after);
          return parts.join("\n\n");
        }

        if (typeof parsed.body === "string") {
          return parsed.body;
        }
      }
    } catch {
      return rawCode;
    }
  }

  // Handle case where raw wrapper JSON was stored without prefix
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.body === "string"
      ) {
        const before = typeof parsed.before === "string" ? parsed.before : "";
        const body = parsed.body;
        const after = typeof parsed.after === "string" ? parsed.after : "";

        if (before.trim() || after.trim()) {
          const parts = [];
          if (before.trim()) parts.push(before);
          if (body) parts.push(body);
          if (after.trim()) parts.push(after);
          return parts.join("\n\n");
        }

        return body;
      }
    } catch {
      return rawCode;
    }
  }

  return rawCode;
}

const extractCleanCode = cleanRound2Code;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req) {
  const value = req.headers.get("authorization");
  if (!value || !value.startsWith("Bearer ")) return null;
  return value.slice(7).trim() || null;
}

function requiredEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value.replace(/\/+$/, "");
}

async function insforgeRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data
        ? data.message ?? data.error ?? JSON.stringify(data)
        : String(data ?? response.statusText);

    const error = new Error(
      `InsForge request failed (${response.status}): ${message}`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function dbRpc(baseUrl, token, functionName, params = {}) {
  return insforgeRequest(
    baseUrl,
    `/api/database/rpc/${encodeURIComponent(functionName)}`,
    {
      method: "POST",
      token,
      body: params,
    },
  );
}

async function dbRecords(baseUrl, token, table, query = "") {
  return insforgeRequest(
    baseUrl,
    `/api/database/records/${encodeURIComponent(table)}${query ? `?${query}` : ""}`,
    {
      method: "GET",
      token,
    },
  );
}

async function dbInsert(baseUrl, token, table, rows) {
  return insforgeRequest(
    baseUrl,
    `/api/database/records/${encodeURIComponent(table)}`,
    {
      method: "POST",
      token,
      prefer: "return=representation",
      body: rows,
    },
  );
}

async function dbUpdate(baseUrl, token, table, query, payload) {
  return insforgeRequest(
    baseUrl,
    `/api/database/records/${encodeURIComponent(table)}?${query}`,
    {
      method: "PATCH",
      token,
      prefer: "return=representation",
      body: payload,
    },
  );
}

function py(value) {
  return JSON.stringify(value)
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False")
    .replace(/\bnull\b/g, "None");
}

function cArray(value) {
  if (!Array.isArray(value)) return `{${String(value)}}`;
  return `{${value.join(", ")}}`;
}

function javaArray(value) {
  if (!Array.isArray(value)) return String(value);
  return `{${value.map((item) => javaArray(item)).join(", ")}}`;
}

/*
 * These helpers are part of the server-generated C harness.
 * They must exist before cSource() is called.
 */
function cPrintIntArray(arrayName, lengthExpression) {
  return `
printf("[");
for (int i = 0; i < ${lengthExpression}; i++) {
    if (i) printf(",");
    printf("%d", ${arrayName}[i]);
}
printf("]\\n");
`.trim();
}

function cPrintStringArray(arrayName, lengthExpression) {
  return `
printf("[");
for (int i = 0; i < ${lengthExpression}; i++) {
    if (i) printf(",");
    printf("\\\"%s\\\"", ${arrayName}[i]);
}
printf("]\\n");
`.trim();
}

function parseStoredImplementation(implementation) {
  if (!implementation || typeof implementation !== "string") {
    return { before: "", body: "", after: "" };
  }

  const trimmed = implementation.trim();

  if (trimmed.startsWith(EDITOR_STORAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        trimmed.slice(EDITOR_STORAGE_PREFIX.length),
      );

      return {
        before: typeof parsed?.before === "string" ? parsed.before : "",
        body: typeof parsed?.body === "string" ? parsed.body : "",
        after: typeof parsed?.after === "string" ? parsed.after : "",
      };
    } catch {
      // Legacy body-only format.
    }
  }

  // Handle case where raw wrapper JSON was stored without prefix
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
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
      // Fallback
    }
  }

  return {
    before: "",
    body: implementation,
    after: "",
  };
}

function bodyOf(implementation) {
  const normalized = String(implementation ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\t/g, "    ")
    .trim();

  if (!normalized) return "";

  const lines = normalized.split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  const commonIndent = nonEmpty.reduce((minimum, line) => {
    const match = line.match(/^ */);
    const indent = match ? match[0].length : 0;
    return Math.min(minimum, indent);
  }, Number.POSITIVE_INFINITY);

  const removeCount = Number.isFinite(commonIndent) ? commonIndent : 0;

  return lines
    .map((line) => {
      if (!line.trim()) return "";
      return line.slice(Math.min(removeCount, line.length));
    })
    .join("\n")
    .trim();
}

function pythonSource(signature, implementation, test, kind) {
  const input = test.input_data;
  const stored = parseStoredImplementation(implementation);
  const body = bodyOf(stored.body);
  const helpersBefore = stored.before ? `${stored.before}\n\n` : "";
  const helpersAfter = stored.after ? `\n\n${stored.after}` : "";

  let invocation = "";

  switch (kind) {
    case "mutating_array":
      if ("k" in input) {
        invocation = `
nums = ${py(input.nums)}
rotate(nums, ${py(input.k)})
print("OUT:" + json.dumps(nums, separators=(",", ":")))
print("CR:" + str(nums == ${py(test.expected_output)}))
`;
      } else {
        invocation = `
nums1 = ${py(input.nums1)}
m = ${py(input.m)}
nums2 = ${py(input.nums2)}
n = ${py(input.n)}
merge(nums1, m, nums2, n)
print("OUT:" + json.dumps(nums1, separators=(",", ":")))
print("CR:" + str(nums1 == ${py(test.expected_output)}))
`;
      }
      break;

    case "return_string_array":
      invocation = `
result = fizz_buzz(${py(input.n)})
print("OUT:" + json.dumps(result, separators=(",", ":")))
print("CR:" + str(result == ${py(test.expected_output)}))
`;
      break;

    case "return_integer":
      if ("mat" in input) {
        invocation = `
result = diagonal_sum(${py(input.mat)})
print("OUT:" + json.dumps(result))
print("CR:" + str(result == ${py(test.expected_output)}))
`;
      } else {
        invocation = `
result = largest_altitude(${py(input.gain)})
print("OUT:" + json.dumps(result))
print("CR:" + str(result == ${py(test.expected_output)}))
`;
      }
      break;

    case "return_integer_array":
      invocation = `
result = left_right_difference(${py(input.nums)})
print("OUT:" + json.dumps(result, separators=(",", ":")))
print("CR:" + str(result == ${py(test.expected_output)}))
`;
      break;

    case "return_double":
      invocation = `
result = find_median_sorted_arrays(${py(input.nums1)}, ${py(input.nums2)})
print("OUT:" + json.dumps(result))
print("CR:" + str(abs(result - ${py(test.expected_output)}) < 0.000001))
`;
      break;

    case "remove_element":
      invocation = `
nums = ${py(input.nums)}
k = remove_element(nums, ${py(input.val)})
actual = {"k": k, "elements": sorted(nums[:k])}
expected = {"k": ${py(test.expected_output.k)}, "elements": sorted(${py(
        test.expected_output.elements,
      )})}
print("OUT:" + json.dumps(actual, separators=(",", ":")))
print("CR:" + str(actual == expected))
`;
      break;

    default:
      throw new Error(`Unsupported Python judge kind: ${kind}`);
  }

  const indentedBody = body
    .split("\n")
    .map((line) => (line ? `    ${line}` : ""))
    .join("\n");

  return `
import json

${helpersBefore}${signature}
${indentedBody}${helpersAfter}
${invocation}
`.trim();
}

function cSource(signature, implementation, test, kind) {
  const input = test.input_data;
  const stored = parseStoredImplementation(implementation);
  const helpersBefore = stored.before ? `${stored.before}\n` : "";
  const helpersAfter = stored.after ? `\n${stored.after}` : "";
  const body = bodyOf(stored.body)
    .split("\n")
    .map((line) => (line ? `    ${line}` : ""))
    .join("\n");

  if (kind === "mutating_array") {
    if ("k" in input) {
      const expected = Array.isArray(test.expected_output)
        ? test.expected_output
        : [];

      return `
#include <stdio.h>
#include <stdlib.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int nums[] = ${cArray(input.nums)};
    rotate(nums, ${(input.nums ?? []).length}, ${Number(input.k)});
    int expected[] = ${cArray(expected)};
    int passed = 1;

    for (int i = 0; i < ${expected.length}; i++) {
        if (nums[i] != expected[i]) passed = 0;
    }

    printf("OUT:");
    ${cPrintIntArray("nums", String(expected.length))}
    printf("CR:%s\\n", passed ? "True" : "False");
    return 0;
}
`.trim();
    }

    const expected = Array.isArray(test.expected_output)
      ? test.expected_output
      : [];

    return `
#include <stdio.h>
#include <stdlib.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int nums1[] = ${cArray(input.nums1)};
    int nums2[] = ${cArray(input.nums2)};

    merge(
        nums1,
        ${(input.nums1 ?? []).length},
        ${Number(input.m)},
        nums2,
        ${(input.nums2 ?? []).length},
        ${Number(input.n)}
    );

    int expected[] = ${cArray(expected)};
    int passed = 1;

    for (int i = 0; i < ${expected.length}; i++) {
        if (nums1[i] != expected[i]) passed = 0;
    }

    printf("OUT:");
    ${cPrintIntArray("nums1", String(expected.length))}
    printf("CR:%s\\n", passed ? "True" : "False");
    return 0;
}
`.trim();
  }

  if (kind === "return_string_array") {
    const expected = Array.isArray(test.expected_output)
      ? test.expected_output
      : [];

    const literals = expected.map((s) => JSON.stringify(s)).join(", ");

    return `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int returnSize = 0;
    char **result = fizzBuzz(${Number(input.n)}, &returnSize);

    const char *expected[] = {${literals}};
    int passed = returnSize == ${expected.length};

    for (int i = 0; passed && i < ${expected.length}; i++) {
        if (strcmp(result[i], expected[i]) != 0) passed = 0;
    }

    printf("OUT:");
    ${cPrintStringArray("result", "returnSize")}
    printf("CR:%s\\n", passed ? "True" : "False");

    for (int i = 0; i < returnSize; i++) free(result[i]);
    free(result);

    return 0;
}
`.trim();
  }

  if (kind === "return_integer") {
    if ("mat" in input) {
      const mat = Array.isArray(input.mat) ? input.mat : [];
      const rows = mat.map((r) => `{${r.join(", ")}}`).join(", ");
      const cols = mat[0]?.length ?? 0;

      return `
#include <stdio.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int data[][${cols}] = {${rows}};
    int *ptrs[${mat.length}];

    for (int i = 0; i < ${mat.length}; i++) {
        ptrs[i] = data[i];
    }

    int colsValue = ${cols};
    int result = diagonalSum(ptrs, ${mat.length}, &colsValue);

    printf("OUT:%d\\n", result);
    printf(
        "CR:%s\\n",
        result == ${Number(test.expected_output)} ? "True" : "False"
    );

    return 0;
}
`.trim();
    }

    return `
#include <stdio.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int gain[] = ${cArray(input.gain)};
    int result = largestAltitude(
        gain,
        ${(input.gain ?? []).length}
    );

    printf("OUT:%d\\n", result);
    printf(
        "CR:%s\\n",
        result == ${Number(test.expected_output)} ? "True" : "False"
    );

    return 0;
}
`.trim();
  }

  if (kind === "return_integer_array") {
    const expected = Array.isArray(test.expected_output)
      ? test.expected_output
      : [];

    return `
#include <stdio.h>
#include <stdlib.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int nums[] = ${cArray(input.nums)};
    int returnSize = 0;

    int *result = leftRightDifference(
        nums,
        ${(input.nums ?? []).length},
        &returnSize
    );

    int expected[] = ${cArray(expected)};
    int passed = returnSize == ${expected.length};

    for (int i = 0; passed && i < returnSize; i++) {
        if (result[i] != expected[i]) passed = 0;
    }

    printf("OUT:");
    ${cPrintIntArray("result", "returnSize")}
    printf("CR:%s\\n", passed ? "True" : "False");

    free(result);
    return 0;
}
`.trim();
  }

  if (kind === "return_double") {
    return `
#include <stdio.h>
#include <math.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int nums1[] = ${cArray(input.nums1)};
    int nums2[] = ${cArray(input.nums2)};

    double result = findMedianSortedArrays(
        nums1,
        ${(input.nums1 ?? []).length},
        nums2,
        ${(input.nums2 ?? []).length}
    );

    printf("OUT:%g\\n", result);
    printf(
        "CR:%s\\n",
        fabs(result - ${Number(test.expected_output)}) < 0.000001
          ? "True"
          : "False"
    );

    return 0;
}
`.trim();
  }

  if (kind === "remove_element") {
    const expected = test.expected_output ?? { k: 0, elements: [] };

    return `
#include <stdio.h>
#include <stdlib.h>

${helpersBefore}${signature} {
${body}
}
${helpersAfter}

int main(void) {
    int nums[] = ${cArray(input.nums)};

    int k = removeElement(
        nums,
        ${(input.nums ?? []).length},
        ${Number(input.val)}
    );

    int expected[] = ${cArray(expected.elements ?? [])};
    int passed = k == ${Number(expected.k)};

    for (int i = 0; passed && i < k; i++) {
        int found = 0;

        for (int j = 0; j < ${(expected.elements ?? []).length}; j++) {
            if (nums[i] == expected[j]) found = 1;
        }

        if (!found) passed = 0;
    }

    printf("OUT:{\\\"k\\\":%d,\\\"elements\\\":[", k);

    for (int i = 0; i < k; i++) {
        if (i) printf(",");
        printf("%d", nums[i]);
    }

    printf("]}\\n");
    printf("CR:%s\\n", passed ? "True" : "False");

    return 0;
}
`.trim();
  }

  throw new Error(`Unsupported C judge kind: ${kind}`);
}

function buildSource(language, signature, implementation, test, kind) {
  if (language === "python") {
    return pythonSource(signature, implementation, test, kind);
  }

  if (language === "c") {
    return cSource(signature, implementation, test, kind);
  }

  throw new Error(`Unsupported programming language: ${language}`);
}

function decodeBase64Utf8(value) {
  if (!value) return value ?? null;

  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function decodeJudgeResult(result) {
  return {
    ...result,
    stdout: decodeBase64Utf8(result.stdout),
    stderr: decodeBase64Utf8(result.stderr),
    compile_output: decodeBase64Utf8(result.compile_output),
    message: decodeBase64Utf8(result.message),
  };
}

async function submit(judgeUrl, auth, languageId, source) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (auth) {
    headers["X-Auth-Token"] = auth;
  }

  const sourceBytes = new TextEncoder().encode(String(source ?? ""));
  let binarySource = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < sourceBytes.length; i += chunkSize) {
    binarySource += String.fromCharCode(
      ...sourceBytes.subarray(i, i + chunkSize),
    );
  }

  const encodedSource = btoa(binarySource);

  const response = await fetch(
    `${judgeUrl.replace(/\/$/, "")}/submissions?base64_encoded=true&wait=true`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        language_id: languageId,
        source_code: encodedSource,
        cpu_time_limit: 2,
        wall_time_limit: 5,
        memory_limit: 128000,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Judge returned HTTP ${response.status}: ${await response.text()}`,
    );
  }

  return decodeJudgeResult(await response.json());
}

function normalizeOutput(value) {
  return String(value ?? "").trim();
}

function passed(result) {
  return (
    result?.status?.id === 3 &&
    /(^|\n)CR:True\s*$/m.test(normalizeOutput(result.stdout))
  );
}

function actualOutput(result) {
  const stdout = String(result?.stdout ?? "");
  const match = stdout.match(/(?:^|\n)OUT:(.*)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

function statusFor(result) {
  const id = result?.status?.id;

  if (id === 3) return "COMPLETED";
  if (id === 4) return "WRONG_ANSWER";
  if (id === 5) return "TIME_LIMIT";
  if (id === 6) return "COMPILATION_ERROR";
  if (id >= 7 && id <= 12) return "RUNTIME_ERROR";
  if (id === 13 || id === 14) return "SYSTEM_ERROR";

  return "SYSTEM_ERROR";
}

function firstRow(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isTruthyRpc(value) {
  if (value === true) return true;

  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    const first = value[0];

    if (first === true) return true;
    if (first && typeof first === "object") {
      if (first.ok === true) return true;
      if (first.result === true) return true;
      if (first.coderelay_user_is_team_member === true) return true;
      if (first.exists === true) return true;
    }
  }

  if (value && typeof value === "object") {
    if (value.ok === true) return true;
    if (value.result === true) return true;
    if (value.coderelay_user_is_team_member === true) return true;
    if (value.exists === true) return true;
  }

  return false;
}

function queryValue(value) {
  return encodeURIComponent(String(value));
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Only POST requests are supported" }, 405);
  }

  try {
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      return json({ error: "Authentication required" }, 401);
    }

    const input = await req.json();

    const sessionId = input?.session_id;
    const teamId = input?.team_id;
    const questionId = input?.question_id;
    const language = input?.language;
    const implementation = input?.implementation;
    const action = input?.action;
    const finalSubmission =
      action === "submit" ||
      (input?.final_submission === true && action !== "run");

    if (
      !sessionId ||
      !teamId ||
      !questionId ||
      !language ||
      typeof implementation !== "string"
    ) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (language !== "c" && language !== "python") {
      return json({ error: "Unsupported programming language" }, 400);
    }

    const insforgeUrl = requiredEnv("INSFORGE_URL");
    const judgeUrl = Deno.env.get("JUDGE0_URL");

    if (!judgeUrl) {
      return json(
        {
          error: "Secure judge is not configured",
          code: "JUDGE_NOT_CONFIGURED",
        },
        503,
      );
    }

    /*
     * Creator-only identity & authorization checks:
     * Parallelize pre-judge database queries to minimize latency.
     */
    let teamRows;
    let memberCheck;
    let sessionRows;
    let expectedQuestion;

    try {
      [teamRows, memberCheck, sessionRows, expectedQuestion] = await Promise.all([
        dbRpc(
          insforgeUrl,
          accessToken,
          "get_round2_team_for_creator",
          { p_team_id: teamId },
        ),
        dbRpc(
          insforgeUrl,
          accessToken,
          "coderelay_user_is_team_member",
          { p_team_id: teamId },
        ),
        dbRecords(
          insforgeUrl,
          accessToken,
          "round2_sessions",
          [
            `id=eq.${queryValue(sessionId)}`,
            "select=id,phase,coding_stage",
            "limit=1",
          ].join("&"),
        ),
        dbRpc(
          insforgeUrl,
          accessToken,
          "get_round2_question_for_team",
          { p_team_id: teamId },
        ),
      ]);
    } catch (error) {
      if (error?.status === 404) {
        return json({ error: "Team not found" }, 404);
      }
      throw error;
    }

    const team = firstRow(teamRows);

    if (!team) {
      return json(
        {
          error:
            "Team not found for this authenticated creator. Make sure you are signed in with the account that created the team.",
        },
        404,
      );
    }

    if (team.status !== "APPROVED") {
      return json(
        { error: "This team is not approved for Round 2" },
        403,
      );
    }

    /*
     * Defense-in-depth membership check. The SQL function should also be
     * creator-only after the Round 2 identity migration.
     */
    if (!isTruthyRpc(memberCheck)) {
      return json(
        {
          error: "You are not a member of this approved team",
        },
        403,
      );
    }

    const session = firstRow(sessionRows);

    if (!session) {
      return json({ error: "Round 2 session not found" }, 404);
    }

    if (session.phase !== "CODING") {
      return json(
        {
          error:
            "Code can only be executed during the coding phase",
        },
        409,
      );
    }

    if (
      finalSubmission &&
      session.coding_stage !== "STUDENT_3"
    ) {
      return json(
        {
          error:
            "Only Student 3 can make the final Round 2 submission",
        },
        409,
      );
    }

    /*
     * The question is resolved from the team number using the existing
     * database RPC. This prevents a client from selecting another team's
     * question by sending a different question_id.
     */
    const resolved = firstRow(expectedQuestion);

    if (!resolved || resolved.question_id !== questionId) {
      return json(
        { error: "Question does not belong to this team" },
        400,
      );
    }

    if (resolved.interface_status !== "APPROVED") {
      return json(
        { error: "Question interface is not approved" },
        409,
      );
    }

    const signature =
      language === "c"
        ? resolved.function_signature_c
        : resolved.function_signature_python;

    if (!signature || !String(signature).trim()) {
      return json(
        { error: "Official function signature is missing" },
        409,
      );
    }

    /*
     * Hidden tests are fetched only with the server-side API key.
     * The student's JWT is never used to retrieve the hidden test suite.
     */
    const serviceKey = Deno.env.get("API_KEY");

    if (!serviceKey) {
      return json(
        {
          error: "Server judge is not configured",
          details: "API_KEY is missing",
        },
        503,
      );
    }

    const [configResult, testsRows] = await Promise.all([
      dbRpc(
        insforgeUrl,
        accessToken,
        "get_round2_judge_config",
        { p_question_id: questionId },
      ),
      dbRecords(
        insforgeUrl,
        serviceKey,
        "round2_test_cases",
        [
          `question_id=eq.${queryValue(questionId)}`,
          "select=id,input_data,expected_output,is_hidden,created_at",
          "order=created_at.asc",
        ].join("&"),
      ),
    ]);

    const configRow = firstRow(configResult);
    const judgeConfig =
      configRow?.judge_config ??
      configRow?.config ??
      configRow ??
      null;

    const kind = judgeConfig?.kind;

    if (!kind) {
      return json(
        { error: "Judge configuration kind is missing" },
        409,
      );
    }

    const tests = Array.isArray(testsRows) ? testsRows : [];

    if (tests.length === 0) {
      return json(
        { error: "No judge tests are configured" },
        409,
      );
    }

    const visibleTests = tests
      .filter((test) => !test.is_hidden)
      .slice(0, 2);

    const cleanImplementation = cleanRound2Code(implementation);

    const started = Date.now();

    /*
     * Controlled concurrency for Judge0 submissions:
     * Run up to 5 concurrent submissions to drastically reduce latency
     * without overwhelming Judge0 when multiple teams run code simultaneously.
     */
    const CONCURRENCY_LIMIT = 5;
    const testResults = new Array(tests.length);
    let nextTestIndex = 0;

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, tests.length) },
      async () => {
        while (nextTestIndex < tests.length) {
          const index = nextTestIndex++;
          const test = tests[index];

          const source = buildSource(
            language,
            String(signature).trim(),
            cleanImplementation,
            test,
            kind,
          );

          const result = await submit(
            judgeUrl,
            Deno.env.get("JUDGE0_AUTH_TOKEN"),
            LANGUAGE_IDS[language],
            source,
          );

          testResults[index] = result;
        }
      },
    );

    await Promise.all(workers);

    let passedTests = 0;
    let representativeResult = testResults[testResults.length - 1] ?? null;
    let errorResult = null;
    let compilationErrorResult = null;

    for (let index = 0; index < tests.length; index++) {
      const result = testResults[index];
      const statusId = result?.status?.id;

      if (statusId === 6 && !compilationErrorResult) {
        compilationErrorResult = result;
      }

      const casePassed = passed(result);

      if (casePassed) {
        passedTests++;
      } else {
        if (!errorResult && statusId && statusId !== 3) {
          errorResult = result;
        }
        if (!representativeResult || representativeResult.status?.id === 3) {
          representativeResult = result;
        }
      }
    }

    const hasCompilationError = Boolean(compilationErrorResult);

    // Compilation error must never receive passed tests or full marks
    if (hasCompilationError) {
      passedTests = 0;
    }

    const last = compilationErrorResult || errorResult || representativeResult;

    const visibleCases = [];
    for (let vIdx = 0; vIdx < visibleTests.length; vIdx++) {
      const visible = visibleTests[vIdx];
      const testIndex = tests.findIndex((t) => t.id === visible.id);
      const result = testIndex >= 0 ? testResults[testIndex] : null;
      const casePassed = hasCompilationError ? false : (result ? passed(result) : false);

      let caseOutput = actualOutput(result) ?? String(result?.stdout ?? "").trim();
      const caseStatusId = result?.status?.id;

      if (hasCompilationError || caseStatusId === 6) {
        const compileMsg =
          result?.compile_output?.trim() ||
          compilationErrorResult?.compile_output?.trim() ||
          last?.compile_output?.trim();
        caseOutput = compileMsg ? `Compilation Error:\n${compileMsg}` : "Compilation Error";
      } else if (caseStatusId >= 7 && caseStatusId <= 12) {
        const runtimeMsg =
          result?.stderr?.trim() ||
          result?.message?.trim() ||
          result?.status?.description;
        caseOutput = runtimeMsg ? `Runtime Error:\n${runtimeMsg}` : "Runtime Error";
      } else if (caseStatusId === 5) {
        caseOutput = "Time Limit Exceeded";
      } else if (!casePassed && !caseOutput) {
        caseOutput = result?.status?.description || "Wrong Answer";
      }

      visibleCases.push({
        case_number: vIdx + 1,
        input_data: visible.input_data,
        output: caseOutput,
        expected_output: visible.expected_output,
        passed: casePassed,
      });
    }

    let finalStatus = "COMPLETED";
    if (hasCompilationError) {
      finalStatus = "COMPILATION_ERROR";
    } else if (errorResult) {
      finalStatus = statusFor(errorResult);
    } else if (passedTests < tests.length) {
      finalStatus = "WRONG_ANSWER";
    }

    const executionTime = Date.now() - started;

    /*
     * Save the run using the student's JWT so the existing database RPC/RLS
     * continues to enforce team/session/question ownership.
     */
    const saved = await dbRpc(
      insforgeUrl,
      accessToken,
      "save_round2_code_run",
      {
        p_session_id: sessionId,
        p_team_id: teamId,
        p_question_id: questionId,
        p_language: language,
        p_source_code: cleanImplementation || "No source code provided",
        p_status: finalStatus,
        p_passed_tests: passedTests,
        p_total_tests: tests.length,
        p_execution_time_ms: executionTime,
        p_memory_kb: last?.memory ?? null,
        p_compiler_output: last?.compile_output ?? null,
        p_runtime_output: last?.stdout ?? null,
        p_error_message:
          last?.stderr ??
          last?.message ??
          (hasCompilationError ? last?.compile_output : null) ??
          null,
      },
    );

    const savedRow = firstRow(saved);

    if (!savedRow && saved == null) {
      return json(
        {
          error:
            "Execution succeeded, but the run could not be stored",
          status: finalStatus,
          visible_cases: visibleCases,
        },
        500,
      );
    }

    /*
     * Official 30-point result:
     * ONLY Student 3 final submission creates/updates this record.
     * Score is calculated from ALL configured visible + hidden cases.
     * RUN requests MUST NEVER calculate or create/update final results.
     */
    let finalResultId = null;

    if (finalSubmission) {
      const totalCases = tests.length;
      const passedCases = hasCompilationError ? 0 : passedTests;
      const failedCases = totalCases - passedCases;

      const visibleCaseCount = tests.filter(
        (test) => !test.is_hidden,
      ).length;

      const hiddenCaseCount = tests.filter(
        (test) => test.is_hidden,
      ).length;

      const score =
        hasCompilationError || totalCases === 0
          ? 0
          : Number(((passedCases / totalCases) * 30).toFixed(2));

      const officialStatus =
        !hasCompilationError && passedCases === totalCases && totalCases > 0
          ? "SOLVED"
          : "ATTEMPTED";

      /*
       * submitted_by uses the approved team's creator ID.
       * Under the single-account relay model this is the authenticated
       * account for the whole team.
       */
      const submittedBy = team.created_by;

      // A team can receive different questions across event runs.
      // The official result is therefore unique by TEAM + QUESTION, not team alone.
      const existingRows = await dbRecords(
        insforgeUrl,
        serviceKey,
        "round2_final_results",
        [
          `team_id=eq.${queryValue(teamId)}`,
          `question_id=eq.${queryValue(questionId)}`,
          "select=id",
          "limit=1",
        ].join("&"),
      );

      const existingResult = firstRow(existingRows);

      const resultPayload = {
        team_id: teamId,
        question_id: questionId,
        submitted_by: submittedBy,
        language,
        total_cases: totalCases,
        passed_cases: passedCases,
        failed_cases: failedCases,
        visible_cases: visibleCaseCount,
        hidden_cases: hiddenCaseCount,
        score,
        max_score: 30,
        status: officialStatus,
        submitted_at: new Date().toISOString(),
      };

      let finalResult;

      if (existingResult?.id) {
        finalResult = await dbUpdate(
          insforgeUrl,
          serviceKey,
          "round2_final_results",
          `id=eq.${queryValue(existingResult.id)}`,
          resultPayload,
        );
      } else {
        finalResult = await dbInsert(
          insforgeUrl,
          serviceKey,
          "round2_final_results",
          [resultPayload],
        );
      }

      const finalRow = firstRow(finalResult);
      finalResultId = finalRow?.id ?? null;

      // Never tell the student that marks were submitted unless the
      // round2_final_results row was actually persisted.
      if (!finalResultId) {
        throw new Error(
          "Final submission was judged, but the marks could not be stored in round2_final_results",
        );
      }

      // Verify the persisted record using the server API key. This catches
      // cases where an InsForge insert/update response is empty or malformed.
      const verifiedRows = await dbRecords(
        insforgeUrl,
        serviceKey,
        "round2_final_results",
        [
          `id=eq.${queryValue(finalResultId)}`,
          `team_id=eq.${queryValue(teamId)}`,
          `question_id=eq.${queryValue(questionId)}`,
          "select=id,team_id,question_id,passed_cases,failed_cases,total_cases,score,max_score,status,submitted_at",
          "limit=1",
        ].join("&"),
      );

      const verifiedResult = firstRow(verifiedRows);

      if (!verifiedResult) {
        throw new Error(
          "Final submission was judged, but InsForge could not verify the saved marks record",
        );
      }

      finalResultId = verifiedResult.id;
    }

    /*
     * Do NOT return passed_tests/total_tests/score to the browser.
     * The browser gets visible-case information only.
     */
    return json({
      run_id: savedRow?.id ?? null,
      status: finalStatus,
      execution_time_ms: executionTime,
      compiler_output: last?.compile_output ?? null,
      runtime_output: last?.stdout ?? null,
      error_message:
        last?.stderr ??
        last?.message ??
        (hasCompilationError ? last?.compile_output : null) ??
        null,
      visible_cases: visibleCases,
      ...(finalSubmission
        ? {
            final_submission: true,
            final_result_saved: true,
          }
        : {}),
    });
  } catch (error) {
    console.error("run-round2-code failed:", error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500,
    );
  }
}
