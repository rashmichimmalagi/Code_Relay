import { createClient } from "npm:@insforge/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Language = "c" | "python";

type RunRequest = {
  session_id: string;
  team_id: string;
  question_id: string;
  language: Language;
  implementation: string;
  final_submission?: boolean;
};

type CodingSession = {
  phase: string;
  coding_stage: string;
  phase_started_at: string | null;
  coding_duration_seconds: number;
  student3_duration_seconds: number;
  coding_extension_seconds: number;
  phase_extension_seconds: number;
};

type TestCase = {
  id: string;
  input_data: Record<string, unknown>;
  expected_output: unknown;
  is_hidden: boolean;
  created_at?: string;
};

type JudgeResult = {
  status?: { id?: number; description?: string };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
};

const LANGUAGE_IDS: Record<Language, number> = { c: 50, python: 71 };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function token(req: Request) {
  const value = req.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function isCodingTimeExpired(session: CodingSession, now = Date.now()) {
  if (!session.phase_started_at) return true;

  const startedAt = Date.parse(session.phase_started_at);
  const stageDuration = session.coding_stage === "STUDENT_3"
    ? Number(session.student3_duration_seconds)
    : Number(session.coding_duration_seconds);
  const extension = Number(
    session.coding_extension_seconds ?? session.phase_extension_seconds ?? 0,
  );
  const deadline = startedAt + (stageDuration + extension) * 1000;

  return !Number.isFinite(deadline) || now >= deadline;
}

async function loadCodingSession(
  db: ReturnType<typeof createClient>,
  sessionId: string,
) {
  const result = await db.database
    .from("round2_sessions")
    .select("phase,coding_stage,phase_started_at,coding_duration_seconds,student3_duration_seconds,coding_extension_seconds,phase_extension_seconds")
    .eq("id", sessionId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data as CodingSession | null;
}

function py(value: unknown) {
  return JSON.stringify(value)
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False")
    .replace(/\bnull\b/g, "None");
}

function cArray(value: unknown) {
  const values = value as number[];
  return `{${values.join(", ")}}`;
}

/*
 * These helpers generate C code for the Judge0 wrapper.
 *
 * IMPORTANT:
 * cPrintIntArray / cPrintStringArray are JavaScript/TypeScript helper
 * functions that generate C source code. They are NOT functions supplied
 * by the student. The previous handler referenced them without defining
 * them, which caused the Edge Function itself to throw:
 *
 *   ReferenceError: cPrintIntArray is not defined
 *
 * before Judge0 could execute the student's C program.
 */
function cPrintIntArray(arrayName: string, lengthExpression: string) {
  return `
  printf("[");
  for (int i = 0; i < ${lengthExpression}; i++) {
    if (i) printf(",");
    printf("%d", ${arrayName}[i]);
  }
  printf("]\\n");
`.trim();
}

function cPrintStringArray(arrayName: string, lengthExpression: string) {
  return `
  printf("[");
  for (int i = 0; i < ${lengthExpression}; i++) {
    if (i) printf(",");
    printf("\\"%s\\"", ${arrayName}[i]);
  }
  printf("]\\n");
`.trim();
}

function javaArray(value: unknown): string {
  if (!Array.isArray(value)) return String(value);
  return `{${value.map((item) => javaArray(item)).join(", ")}}`;
}

const EDITOR_STORAGE_PREFIX = "__CODERELAY_EDITOR_V1__";

type StoredImplementation = {
  before: string;
  body: string;
  after: string;
};

function parseStoredImplementation(implementation: string): StoredImplementation {
  if (implementation.startsWith(EDITOR_STORAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        implementation.slice(EDITOR_STORAGE_PREFIX.length),
      ) as Partial<StoredImplementation>;

      return {
        before: typeof parsed.before === "string" ? parsed.before : "",
        body: typeof parsed.body === "string" ? parsed.body : "",
        after: typeof parsed.after === "string" ? parsed.after : "",
      };
    } catch {
      // Fall back to legacy body-only storage.
    }
  }

  return {
    before: "",
    body: implementation,
    after: "",
  };
}

function bodyOf(implementation: string) {
  const normalized = implementation
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\t/g, "    ")
    .trim();

  if (!normalized) return "";

  /*
   * The browser editor displays the implementation inside the function,
   * so every body line normally carries the function's visual indentation.
   * Remove only the COMMON leading indentation here.
   *
   * Example:
   *
   *     j = 0
   *     for i in range(...):
   *         nums1[i] = nums2[j]
   *
   * becomes:
   *
   * j = 0
   * for i in range(...):
   *     nums1[i] = nums2[j]
   *
   * Then the language wrapper adds the function indentation exactly once.
   * Relative/nested indentation is preserved.
   */
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

function pythonSource(signature: string, implementation: string, test: TestCase, kind: string) {
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
expected = {"k": ${py((test.expected_output as { k: number }).k)}, "elements": sorted(${py((test.expected_output as { elements: number[] }).elements)})}
print("OUT:" + json.dumps(actual, separators=(",", ":")))
print("CR:" + str(actual == expected))
`;
      break;
    default:
      throw new Error(`Unsupported Python judge kind: ${kind}`);
  }

  return `import json\n\n${helpersBefore}${signature}\n${body.split("\n").map((line) => line ? `    ${line}` : "").join("\n")}${helpersAfter}\n${invocation}`.trim();
}

function cSource(signature: string, implementation: string, test: TestCase, kind: string) {
  const input = test.input_data;
  const stored = parseStoredImplementation(implementation);
  const helpersBefore = stored.before ? `${stored.before}\n` : "";
  const helpersAfter = stored.after ? `\n${stored.after}` : "";
  const body = bodyOf(stored.body).split("\n").map((line) => line ? `    ${line}` : "").join("\n");

  if (kind === "mutating_array") {
    if ("k" in input) {
      return `
#include <stdio.h>
#include <stdlib.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int nums[] = ${cArray(input.nums)};
    rotate(nums, ${Number((input.nums as number[]).length)}, ${Number(input.k)});
    int expected[] = ${cArray(test.expected_output)};
    int passed = 1;
    for (int i = 0; i < ${((test.expected_output as number[]).length)}; i++) if (nums[i] != expected[i]) passed = 0;
    printf("OUT:");
    ${cPrintIntArray("nums", String(((test.expected_output as number[]).length)))}
    printf("CR:%s\\n", passed ? "True" : "False");
    return 0;
}
`.trim();
    }

    return `
#include <stdio.h>
#include <stdlib.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int nums1[] = ${cArray(input.nums1)};
    int nums2[] = ${cArray(input.nums2)};
    merge(nums1, ${Number((input.nums1 as number[]).length)}, ${Number(input.m)}, nums2, ${Number((input.nums2 as number[]).length)}, ${Number(input.n)});
    int expected[] = ${cArray(test.expected_output)};
    int passed = 1;
    for (int i = 0; i < ${((test.expected_output as number[]).length)}; i++) if (nums1[i] != expected[i]) passed = 0;
    printf("OUT:");
    ${cPrintIntArray("nums1", String(((test.expected_output as number[]).length)))}
    printf("CR:%s\\n", passed ? "True" : "False");
    return 0;
}
`.trim();
  }

  if (kind === "return_string_array") {
    const expected = test.expected_output as string[];
    const literals = expected.map((s) => JSON.stringify(s)).join(", ");
    return `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int returnSize = 0;
    char **result = fizzBuzz(${Number(input.n)}, &returnSize);
    const char *expected[] = {${literals}};
    int passed = returnSize == ${expected.length};
    for (int i = 0; passed && i < ${expected.length}; i++) if (strcmp(result[i], expected[i]) != 0) passed = 0;
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
      const mat = input.mat as number[][];
      const rows = mat.map((r) => `{${r.join(", ")}}`).join(", ");
      return `
#include <stdio.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int data[][${mat[0]?.length ?? 0}] = {${rows}};
    int *ptrs[${mat.length}];
    for (int i = 0; i < ${mat.length}; i++) ptrs[i] = data[i];
    int cols = ${mat[0]?.length ?? 0};
    int result = diagonalSum(ptrs, ${mat.length}, &cols);
    printf("OUT:%d\\n", result);
    printf("CR:%s\\n", result == ${Number(test.expected_output)} ? "True" : "False");
    return 0;
}
`.trim();
    }

    return `
#include <stdio.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int gain[] = ${cArray(input.gain)};
    int result = largestAltitude(gain, ${Number((input.gain as number[]).length)});
    printf("OUT:%d\\n", result);
    printf("CR:%s\\n", result == ${Number(test.expected_output)} ? "True" : "False");
    return 0;
}
`.trim();
  }

  if (kind === "return_integer_array") {
    return `
#include <stdio.h>
#include <stdlib.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int nums[] = ${cArray(input.nums)};
    int returnSize = 0;
    int *result = leftRightDifference(nums, ${Number((input.nums as number[]).length)}, &returnSize);
    int expected[] = ${cArray(test.expected_output)};
    int passed = returnSize == ${((test.expected_output as number[]).length)};
    for (int i = 0; passed && i < returnSize; i++) if (result[i] != expected[i]) passed = 0;
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
${helpersAfter}int main(void) {
    int nums1[] = ${cArray(input.nums1)};
    int nums2[] = ${cArray(input.nums2)};
    double result = findMedianSortedArrays(nums1, ${Number((input.nums1 as number[]).length)}, nums2, ${Number((input.nums2 as number[]).length)});
    printf("OUT:%g\\n", result);
    printf("CR:%s\\n", fabs(result - ${Number(test.expected_output)}) < 0.000001 ? "True" : "False");
    return 0;
}
`.trim();
  }

  if (kind === "remove_element") {
    const expected = test.expected_output as { k: number; elements: number[] };
    return `
#include <stdio.h>
#include <stdlib.h>
${helpersBefore}${signature} {
${body}
}
${helpersAfter}int main(void) {
    int nums[] = ${cArray(input.nums)};
    int k = removeElement(nums, ${Number((input.nums as number[]).length)}, ${Number(input.val)});
    int expected[] = ${cArray(expected.elements)};
    int passed = k == ${expected.k};
    for (int i = 0; passed && i < k; i++) {
        int found = 0;
        for (int j = 0; j < ${expected.elements.length}; j++) if (nums[i] == expected[j]) found = 1;
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

function javaSource(signature: string, implementation: string, test: TestCase, kind: string) {
  const input = test.input_data;
  const stored = parseStoredImplementation(implementation);
  const helpersBefore = stored.before ? `${stored.before}\n    ` : "";
  const helpersAfter = stored.after ? `\n    ${stored.after}` : "";
  const body = bodyOf(stored.body).split("\n").map((line) => line ? `        ${line}` : "").join("\n");
  let invocation = "";

  switch (kind) {
    case "mutating_array":
      if ("k" in input) {
        invocation = `
int[] nums = ${javaArray(input.nums)};
solution.rotate(nums, ${Number(input.k)});
int[] expected = ${javaArray(test.expected_output)};
System.out.println("OUT:" + Arrays.toString(nums));
        System.out.println("CR:" + Arrays.equals(nums, expected));
`;
      } else {
        invocation = `
int[] nums1 = ${javaArray(input.nums1)};
int[] nums2 = ${javaArray(input.nums2)};
solution.merge(nums1, ${Number(input.m)}, nums2, ${Number(input.n)});
int[] expected = ${javaArray(test.expected_output)};
System.out.println("OUT:" + Arrays.toString(nums1));
System.out.println("CR:" + Arrays.equals(nums1, expected));
`;
      }
      break;
    case "return_string_array":
      invocation = `
List<String> result = solution.fizzBuzz(${Number(input.n)});
List<String> expected = Arrays.asList(${(test.expected_output as string[]).map((x) => JSON.stringify(x)).join(", ")});
System.out.println("OUT:" + result);
System.out.println("CR:" + result.equals(expected));
`;
      break;
    case "return_integer":
      if ("mat" in input) {
        invocation = `
int[][] mat = ${javaArray(input.mat)};
int result = solution.diagonalSum(mat);
System.out.println("OUT:" + result);
System.out.println("CR:" + (result == ${Number(test.expected_output)}));
`;
      } else {
        invocation = `
int[] gain = ${javaArray(input.gain)};
int result = solution.largestAltitude(gain);
System.out.println("OUT:" + result);
System.out.println("CR:" + (result == ${Number(test.expected_output)}));
`;
      }
      break;
    case "return_integer_array":
      invocation = `
int[] nums = ${javaArray(input.nums)};
int[] result = solution.leftRightDifference(nums);
int[] expected = ${javaArray(test.expected_output)};
System.out.println("OUT:" + Arrays.toString(result));
System.out.println("CR:" + Arrays.equals(result, expected));
`;
      break;
    case "return_double":
      invocation = `
int[] nums1 = ${javaArray(input.nums1)};
int[] nums2 = ${javaArray(input.nums2)};
double result = solution.findMedianSortedArrays(nums1, nums2);
System.out.println("OUT:" + result);
System.out.println("CR:" + (Math.abs(result - ${Number(test.expected_output)}) < 0.000001));
`;
      break;
    case "remove_element":
      {
        const expected = test.expected_output as { k: number; elements: number[] };
        invocation = `
int[] nums = ${javaArray(input.nums)};
int k = solution.removeElement(nums, ${Number(input.val)});
int expectedK = ${expected.k};
int[] expected = ${javaArray(expected.elements)};
boolean passed = k == expectedK;
if (passed) {
    int[] actual = Arrays.copyOf(nums, k);
    Arrays.sort(actual);
    Arrays.sort(expected);
    passed = Arrays.equals(actual, expected);
}
System.out.println("OUT:" + "{\\\"k\\\":" + k + ",\\\"elements\\\":" + Arrays.toString(Arrays.copyOf(nums, k)) + "}");
System.out.println("CR:" + passed);
`;
      }
      break;
    default:
      throw new Error(`Unsupported Java judge kind: ${kind}`);
  }

  return `
import java.util.*;
class Solution {
    ${helpersBefore}${signature} {
${body}
    }${helpersAfter}
}
public class Main {
    public static void main(String[] args) {
        Solution solution = new Solution();
${invocation.split("\n").map((x) => x ? `        ${x}` : "").join("\n")}
    }
}
`.trim();
}

function buildSource(language: Language, signature: string, implementation: string, test: TestCase, kind: string) {
  if (language === "python") return pythonSource(signature, implementation, test, kind);
  if (language === "c") return cSource(signature, implementation, test, kind);
  throw new Error(`Unsupported programming language: ${language}`);
}

function normalizeOutput(value: string | null | undefined) {
  return (value ?? "").trim();
}

function passed(result: JudgeResult) {
  return (
    result.status?.id === 3 &&
    /(^|\n)CR:True\s*$/m.test(normalizeOutput(result.stdout))
  );
}

function actualOutput(result: JudgeResult): string | null {
  const stdout = result.stdout ?? "";
  const match = stdout.match(/(?:^|\n)OUT:(.*)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

function statusFor(result: JudgeResult) {
  const id = result.status?.id;
  if (id === 3) return "COMPLETED";
  if (id === 4 || id === 6) return "COMPILATION_ERROR";
  if (id === 5 || id === 9) return "TIME_LIMIT";
  if (id === 7 || id === 8 || id === 11 || id === 12) return "RUNTIME_ERROR";
  if (id === 13 || id === 14) return "SYSTEM_ERROR";
  return "SYSTEM_ERROR";
}

async function submit(judgeUrl: string, auth: string | undefined, languageId: number, source: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers["X-Auth-Token"] = auth;

  const response = await fetch(`${judgeUrl.replace(/\/$/, "")}/submissions?wait=true&base64_encoded=false`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: languageId,
      source_code: source,
      cpu_time_limit: 2,
      wall_time_limit: 5,
      memory_limit: 128000,
    }),
  });

  if (!response.ok) throw new Error(`Judge returned HTTP ${response.status}: ${await response.text()}`);
  return (await response.json()) as JudgeResult;
}

export default async function (req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Only POST requests are supported" }, 405);

  try {
    const accessToken = token(req);
    if (!accessToken) return json({ error: "Authentication required" }, 401);

    const input = (await req.json()) as Partial<RunRequest>;
    const { session_id, team_id, question_id, language, implementation, final_submission = false } = input;

    if (!session_id || !team_id || !question_id || !language || typeof implementation !== "string") {
      return json({ error: "Missing required fields" }, 400);
    }

    if (!["c", "python"].includes(language)) {
      return json({ error: "Unsupported programming language" }, 400);
    }

    const insforgeUrl = Deno.env.get("INSFORGE_URL");
    const judgeUrl = Deno.env.get("JUDGE0_URL");
    const judgeAuth = Deno.env.get("JUDGE0_AUTH_TOKEN");

    if (!insforgeUrl) throw new Error("INSFORGE_URL is not configured");
    if (!judgeUrl) return json({ error: "Secure judge is not configured", code: "JUDGE_NOT_CONFIGURED" }, 503);

    const db = createClient({ baseUrl: insforgeUrl, accessToken });

    const currentUser = await db.auth.getCurrentUser();
    if (currentUser.error || !currentUser.data?.user) return json({ error: "Invalid authentication" }, 401);
    const userId = currentUser.data.user.id;

    /*
     * Resolve the team through a SECURITY DEFINER RPC instead of selecting
     * directly from public.teams with the student's access token.
     *
     * The direct RLS-protected query previously returned no row for Student 3
     * even though the team existed, producing the misleading:
     *
     *   Team not found
     *
     * In the single-laptop relay model the authenticated account is the team
     * account, so get_round2_team_for_creator() is the authoritative lookup.
     */
    const teamResult = await db.database.rpc(
      "get_round2_team_for_creator",
      { p_team_id: team_id },
    );

    if (teamResult.error) {
      return json({
        error: "Unable to resolve your Round 2 team",
        details: teamResult.error,
      }, 500);
    }

    const team = Array.isArray(teamResult.data)
      ? teamResult.data[0]
      : teamResult.data;

    if (!team) {
      return json({ error: "Team not found" }, 404);
    }

    if (team.status !== "APPROVED") {
      return json({
        error: "This team is not approved for Round 2",
      }, 403);
    }

    /*
     * Round 2 is a three-student relay. Any authenticated team member may
     * execute code. Final submission is restricted to Student 3 and is
     * therefore the only action that creates/updates the official marks row.
     */
    const memberCheck = await db.database.rpc("coderelay_user_is_team_member", {
      p_team_id: team_id,
    });

    if (memberCheck.error) {
      return json({
        error: "Unable to verify team membership",
        details: memberCheck.error,
      }, 500);
    }

    const isTeamMember =
      memberCheck.data === true ||
      (Array.isArray(memberCheck.data) && memberCheck.data[0] === true);

    if (!isTeamMember) {
      return json({ error: "You are not authorized for this team" }, 403);
    }

    const session = await loadCodingSession(db, session_id);

    if (!session) {
      return json({ error: "Round 2 session not found" }, 404);
    }

    if (session.phase !== "CODING") {
      return json({ error: "Code can only be executed during the coding phase" }, 409);
    }

    if (session.coding_stage !== "STUDENT_3") {
      return json({ error: "Only Student 3 can run Round 2 code" }, 409);
    }

    if (isCodingTimeExpired(session)) {
      return json({ error: "Round 2 coding time has expired" }, 409);
    }

    if (final_submission && session.coding_stage !== "STUDENT_3") {
      return json({
        error: "Only Student 3 can make the final Round 2 submission",
      }, 409);
    }

    /* Team number determines the question. Do NOT compare against the global session.question_id. */
    const expectedQuestion = await db.database.rpc("get_round2_question_for_team", { p_team_id: team_id });
    if (expectedQuestion.error) return json({ error: "Unable to resolve the team's question", details: expectedQuestion.error }, 500);

    const resolved = (expectedQuestion.data as Array<{ question_id: string; function_signature_c: string | null; function_signature_python: string | null; function_signature_java: string | null; interface_status: string }>)?.[0];

    if (!resolved || resolved.question_id !== question_id) {
      return json({ error: "Question does not belong to this team" }, 400);
    }

    if (resolved.interface_status !== "APPROVED") {
      return json({ error: "Question interface is not approved" }, 409);
    }

    const signature =
      language === "c"
        ? resolved.function_signature_c
        : resolved.function_signature_python;

    if (!signature?.trim()) return json({ error: "Official function signature is missing" }, 409);

    const configResult = await db.database.rpc("get_round2_judge_config", { p_question_id: question_id });
    if (configResult.error || !configResult.data?.[0]) {
      return json({ error: "Judge configuration is missing", details: configResult.error ?? null }, 409);
    }

    const configRow = configResult.data[0] as { judge_config?: { kind?: string } };
    const kind = configRow.judge_config?.kind;
    if (!kind) return json({ error: "Judge configuration kind is missing" }, 409);

    /*
     * Hidden tests must never be fetched with the student's access token.
     * Use a server-only InsForge service key so RLS cannot expose hidden
     * cases to the browser. The service key is an Edge Function secret.
     */
    const serviceKey =
      Deno.env.get("API_KEY") ??
      Deno.env.get("INSFORGE_SERVICE_KEY") ??
      Deno.env.get("INSFORGE_ADMIN_KEY");

    if (!serviceKey) {
      return json({
        error: "Server judge is not configured",
        details: "API_KEY is missing",
      }, 503);
    }

    const judgeDb = createClient({
      baseUrl: insforgeUrl,
      accessToken: serviceKey,
    });

    const testsResult = await judgeDb.database
      .from("round2_test_cases")
      .select("id, input_data, expected_output, is_hidden, created_at")
      .eq("question_id", question_id)
      .order("created_at", { ascending: true });

    if (testsResult.error) {
      return json({
        error: "Unable to load judge tests",
        details: testsResult.error,
      }, 500);
    }

    const tests = (testsResult.data as TestCase[]) ?? [];
    if (!tests.length) {
      return json({ error: "No judge tests are configured" }, 409);
    }

    const visibleTests = tests
      .filter((test) => !test.is_hidden)
      .slice(0, 2);

    const cleanImplementation = bodyOf(implementation);
    let passedTests = 0;
    let last: JudgeResult | null = null;
    const visibleCases: Array<{
      case_number: number;
      input_data: unknown;
      output: unknown;
      expected_output: unknown;
      passed: boolean;
    }> = [];
    const started = Date.now();

    for (let index = 0; index < tests.length; index++) {
      const test = tests[index];
      const source = buildSource(
        language,
        signature.trim(),
        cleanImplementation,
        test,
        kind,
      );
      const result = await submit(
        judgeUrl,
        judgeAuth,
        LANGUAGE_IDS[language],
        source,
      );
      last = result;

      const casePassed = passed(result);

      if (casePassed) {
        passedTests++;
      }

      /*
       * Only the two visible cases are included in the response.
       * Hidden cases are judged here but never serialized to the client.
       */
      const visibleIndex = visibleTests.findIndex(
        (visible) => visible.id === test.id,
      );

      if (visibleIndex >= 0) {
        visibleCases.push({
          case_number: visibleIndex + 1,
          input_data: test.input_data,
          output: actualOutput(result) ?? result.stdout?.trim() ?? "",
          expected_output: test.expected_output,
          passed: casePassed,
        });
      }

      /*
       * Do not break on a wrong answer or runtime failure. Every configured
       * judge case is executed so passed_tests/total_tests represent the
       * complete question test suite.
       */
    }

    const finalStatus =
      last?.status?.id === 3
        ? (passedTests === tests.length ? "COMPLETED" : "WRONG_ANSWER")
        : statusFor(last ?? {});

    const executionTime = Date.now() - started;

    const sessionBeforeSave = await loadCodingSession(db, session_id);
    if (
      !sessionBeforeSave ||
      sessionBeforeSave.phase !== "CODING" ||
      sessionBeforeSave.coding_stage !== "STUDENT_3" ||
      isCodingTimeExpired(sessionBeforeSave)
    ) {
      return json({ error: "Round 2 coding time has expired" }, 409);
    }

    /*
     * Save through the existing RPC. This avoids exposing a direct student insert path.
     * The RPC must accept the status string WRONG_ANSWER; if the DB constraint does not,
     * add that status to round2_code_runs.
     */
    const saved = await db.database.rpc("save_round2_code_run", {
      p_session_id: session_id,
      p_team_id: team_id,
      p_question_id: question_id,
      p_language: language,
      p_source_code: "Server-generated judge source",
      p_status: finalStatus,
      p_passed_tests: passedTests,
      p_total_tests: tests.length,
      p_execution_time_ms: executionTime,
      p_memory_kb: last?.memory ?? null,
      p_compiler_output: last?.compile_output ?? null,
      p_runtime_output: last?.stdout ?? null,
      p_error_message: last?.stderr ?? last?.message ?? null,
    });

    if (saved.error) {
      if (/coding time has expired|not in an active coding stage/i.test(saved.error.message ?? "")) {
        return json({ error: saved.error.message }, 409);
      }

      return json({
        run_id: null,
        status: finalStatus,
        execution_time_ms: executionTime,
        compiler_output: last?.compile_output ?? null,
        runtime_output: last?.stdout ?? null,
        error_message: saved.error.message ?? "Execution result could not be stored",
        visible_cases: visibleCases,
        storage_error: saved.error,
      });
    }

    const row = Array.isArray(saved.data) ? saved.data[0] : saved.data;

    /*
     * Official marks are created ONLY for the final Student 3 submission.
     * The score never goes back to the student response.
     *
     * 30 marks are distributed equally across every configured visible and
     * hidden test case.
     */
    let finalResultId: string | null = null;
    let finalResultSummary: {
      total_cases: number;
      passed_cases: number;
      failed_cases: number;
      visible_cases: number;
      hidden_cases: number;
      score: number;
      max_score: number;
      status: "SOLVED" | "ATTEMPTED";
    } | null = null;

    if (final_submission) {
      const sessionBeforeFinalResult = await loadCodingSession(db, session_id);
      if (
        !sessionBeforeFinalResult ||
        sessionBeforeFinalResult.phase !== "CODING" ||
        sessionBeforeFinalResult.coding_stage !== "STUDENT_3" ||
        isCodingTimeExpired(sessionBeforeFinalResult)
      ) {
        return json({ error: "Round 2 coding time has expired" }, 409);
      }

      const totalCases = tests.length;
      const passedCases = passedTests;
      const failedCases = totalCases - passedCases;
      const visibleCaseCount = tests.filter((test) => !test.is_hidden).length;
      const hiddenCaseCount = tests.filter((test) => test.is_hidden).length;
      const score = Number(((passedCases / totalCases) * 30).toFixed(2));
      const officialStatus =
        passedCases === totalCases ? "SOLVED" : "ATTEMPTED";

      const existingResult = await judgeDb.database
        .from("round2_final_results")
        .select("id")
        .eq("team_id", team_id)
        .eq("question_id", question_id)
        .maybeSingle();

      if (existingResult.error) {
        return json({
          error: "Unable to check existing Round 2 final result",
          details: existingResult.error,
        }, 500);
      }

      const resultPayload = {
        team_id,
        question_id,
        submitted_by: userId,
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

      const finalResult = existingResult.data?.id
        ? await judgeDb.database
            .from("round2_final_results")
            .update(resultPayload)
            .eq("id", existingResult.data.id)
            .select("id")
            .maybeSingle()
        : await judgeDb.database
            .from("round2_final_results")
            .insert(resultPayload)
            .select("id")
            .maybeSingle();

      if (finalResult.error) {
        return json({
          error: "Code execution succeeded, but the final marks could not be saved",
          details: finalResult.error,
        }, 500);
      }

      finalResultId = finalResult.data?.id ?? null;
      finalResultSummary = {
        total_cases: totalCases,
        passed_cases: passedCases,
        failed_cases: failedCases,
        visible_cases: visibleCaseCount,
        hidden_cases: hiddenCaseCount,
        score,
        max_score: 30,
        status: officialStatus,
      };
    }

    /*
     * Do not return passed_tests or total_tests. The student must not receive
     * the official marks or enough information to calculate them.
     */
    return json({
      run_id: (row as { id?: string } | null)?.id ?? null,
      status: finalStatus,
      execution_time_ms: executionTime,
      compiler_output: last?.compile_output ?? null,
      runtime_output: last?.stdout ?? null,
      error_message: last?.stderr ?? last?.message ?? null,
      visible_cases: visibleCases,
      ...(final_submission
        ? {
            final_submission: true,
            final_result_saved: Boolean(finalResultId),
            final_result: finalResultSummary,
          }
        : {}),
    });
  } catch (error) {
    console.error("run-round2-code failed:", error);
    return json({
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}
