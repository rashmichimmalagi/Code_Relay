import { createClient } from "npm:@insforge/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Coderelay-Import-Secret",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

type DatasetCase = {
  case_id: string;
  input: unknown;
  expected_output?: unknown;
  expected_k?: number;
  expected_elements?: unknown;
};

type DatasetQuestion = {
  title: string;
  visible_cases: DatasetCase[];
  hidden_cases: DatasetCase[];
};

type Dataset = {
  questions: DatasetQuestion[];
};

function convertExpectedOutput(testCase: DatasetCase) {
  if ("expected_output" in testCase) {
    return testCase.expected_output;
  }

  if (
    "expected_k" in testCase &&
    "expected_elements" in testCase
  ) {
    return {
      k: testCase.expected_k,
      elements: testCase.expected_elements,
    };
  }

  throw new Error(
    `Test case "${testCase.case_id}" has no supported expected output.`,
  );
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Only POST requests are supported." },
      405,
    );
  }

  try {
    // ------------------------------------------------------------
    // 1. Authenticate importer
    // ------------------------------------------------------------

    const importSecret = getEnv("CODERELAY_IMPORT_SECRET");

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "Request body must be valid JSON." },
        400,
      );
    }

    const suppliedSecret =
      typeof body.import_secret === "string"
        ? body.import_secret
        : req.headers.get("X-Coderelay-Import-Secret");

    if (!suppliedSecret || suppliedSecret !== importSecret) {
      return jsonResponse(
        { error: "Invalid importer credentials." },
        401,
      );
    }

    // ------------------------------------------------------------
    // 2. Read dataset from request
    // ------------------------------------------------------------

    if (!body.dataset) {
      return jsonResponse(
        { error: "Missing dataset." },
        400,
      );
    }

    const dataset = body.dataset as Dataset;

    if (!Array.isArray(dataset.questions)) {
      return jsonResponse(
        { error: "dataset.questions must be an array." },
        400,
      );
    }

    if (dataset.questions.length !== 8) {
      return jsonResponse(
        {
          error:
            `Expected 8 questions, found ${dataset.questions.length}.`,
        },
        400,
      );
    }

    // ------------------------------------------------------------
    // 3. Server-side InsForge client
    // ------------------------------------------------------------

    const adminClient = createClient({
      baseUrl: getEnv("INSFORGE_BASE_URL"),
      anonKey: getEnv("API_KEY"),
    });

    // ------------------------------------------------------------
    // 4. Load existing questions
    // ------------------------------------------------------------

    const questionResult = await adminClient.database
      .from("round2_questions")
      .select("id, title")
      .order("created_at", { ascending: true });

    if (questionResult.error) {
      throw new Error(
        `Unable to load Round 2 questions: ${questionResult.error.message}`,
      );
    }

    const existingQuestions = (questionResult.data ?? []) as {
      id: string;
      title: string;
    }[];

    if (existingQuestions.length !== 8) {
      throw new Error(
        `Expected exactly 8 existing questions, found ${existingQuestions.length}.`,
      );
    }

    // ------------------------------------------------------------
    // 5. Find which questions already have test cases
    // ------------------------------------------------------------

    const existingTestsResult = await adminClient.database
      .from("round2_test_cases")
      .select("question_id");

    if (existingTestsResult.error) {
      throw new Error(
        `Unable to inspect existing test cases: ${existingTestsResult.error.message}`,
      );
    }

    const existingTestQuestionIds = new Set(
      (existingTestsResult.data ?? []).map(
        (row: { question_id: string }) =>
          row.question_id,
      ),
    );

    let questionsProcessed = 0;
    let questionsSkipped = 0;
    let visibleTestsImported = 0;
    let hiddenTestsImported = 0;

    // ------------------------------------------------------------
    // 6. Import only questions that have no test cases yet
    // ------------------------------------------------------------

    for (const datasetQuestion of dataset.questions) {
      const existingQuestion = existingQuestions.find(
        (question) =>
          question.title === datasetQuestion.title,
      );

      if (!existingQuestion) {
        throw new Error(
          `Could not find existing question "${datasetQuestion.title}".`,
        );
      }

      if (
        existingTestQuestionIds.has(
          existingQuestion.id,
        )
      ) {
        questionsSkipped++;
        continue;
      }

      if (!Array.isArray(datasetQuestion.visible_cases)) {
        throw new Error(
          `Question "${datasetQuestion.title}" has no visible_cases array.`,
        );
      }

      if (!Array.isArray(datasetQuestion.hidden_cases)) {
        throw new Error(
          `Question "${datasetQuestion.title}" has no hidden_cases array.`,
        );
      }

      if (datasetQuestion.visible_cases.length === 0) {
        throw new Error(
          `Question "${datasetQuestion.title}" has no visible test cases.`,
        );
      }

      if (datasetQuestion.hidden_cases.length === 0) {
        throw new Error(
          `Question "${datasetQuestion.title}" has no hidden test cases.`,
        );
      }

      questionsProcessed++;

      // ----------------------------------------------------------
      // Visible cases
      // ----------------------------------------------------------

      for (const testCase of datasetQuestion.visible_cases) {
        const result = await adminClient.database
          .from("round2_test_cases")
          .insert({
            question_id: existingQuestion.id,
            input_data: testCase.input,
            expected_output:
              convertExpectedOutput(testCase),
            is_hidden: false,
          });

        if (result.error) {
          throw new Error(
            `Failed to insert visible case "${testCase.case_id}" for "${datasetQuestion.title}": ${result.error.message}`,
          );
        }

        visibleTestsImported++;
      }

      // ----------------------------------------------------------
      // Hidden cases
      // ----------------------------------------------------------

      for (const testCase of datasetQuestion.hidden_cases) {
        const result = await adminClient.database
          .from("round2_test_cases")
          .insert({
            question_id: existingQuestion.id,
            input_data: testCase.input,
            expected_output:
              convertExpectedOutput(testCase),
            is_hidden: true,
          });

        if (result.error) {
          throw new Error(
            `Failed to insert hidden case "${testCase.case_id}" for "${datasetQuestion.title}": ${result.error.message}`,
          );
        }

        hiddenTestsImported++;
      }
    }

    // ------------------------------------------------------------
    // 7. Return summary
    // ------------------------------------------------------------

    return jsonResponse({
      success: true,
      message:
        "Missing CodeRelay Round 2 test cases imported successfully.",
      questions_processed: questionsProcessed,
      questions_skipped: questionsSkipped,
      visible_tests_imported: visibleTestsImported,
      hidden_tests_imported: hiddenTestsImported,
      total_tests_imported:
        visibleTestsImported + hiddenTestsImported,
    });
  } catch (error) {
    console.error(
      "Round 2 test-case repair failed:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
}