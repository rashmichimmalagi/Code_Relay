type RequestBody = {
  title: string;
  question_text: string;
};

type FunctionContract = {
  signature: string;
  explanation: string;
};

type GeneratedInterfaces = {
  c: FunctionContract;
  python: FunctionContract;
  java: FunctionContract;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(
  body: unknown,
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

function extractJson(
  text: string,
): GeneratedInterfaces {
  let cleaned = text.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (
    !parsed?.c?.signature ||
    !parsed?.python?.signature ||
    !parsed?.java?.signature
  ) {
    throw new Error(
      "AI returned incomplete function interfaces.",
    );
  }

  return parsed as GeneratedInterfaces;
}

export default async function handler(
  req: Request,
) {
  // Browser CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const body =
      (await req.json()) as RequestBody;

    const title = body.title?.trim();
    const questionText =
      body.question_text?.trim();

    if (!title || !questionText) {
      return jsonResponse(
        {
          error:
            "title and question_text are required",
        },
        400,
      );
    }

    /*
     * The OpenAI key is stored as an InsForge server-side
     * secret. It is NEVER exposed to the React application.
     */
    const openaiApiKey =
      Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error(
        "OPENAI_API_KEY is not configured in InsForge secrets.",
      );
    }

    const prompt = `
You are designing a competitive-programming problem interface.

Analyze the programming problem below and generate
LeetCode/HackerRank-style function or method interfaces.

The platform supports:

- C
- Python
- Java

IMPORTANT RULES:

1. Students implement ONLY a function or method.
2. Do NOT generate main().
3. Do NOT generate scanf().
4. Do NOT generate input parsing.
5. Do NOT generate print statements.
6. Do NOT generate output handling.
7. Do NOT generate test cases.
8. Do NOT solve the problem.
9. Do NOT invent unnecessary parameters.
10. Use the natural input and output types required by the problem.
11. The interface must be suitable for an automated competitive-programming judge.
12. C must correctly represent arrays, strings, pointers,
    output sizes, and memory ownership when required.
13. Python must use a normal function definition.
14. Java must use a normal method definition.
15. If a helper structure such as TreeNode or ListNode is required,
    mention it in the explanation instead of defining it inside
    the student's function.
16. Follow common competitive-programming conventions.
17. The signature must contain an empty implementation body where
    appropriate.
18. Do not include solution logic inside the generated interface.
19. The interface must be specific to this problem.
20. Return ONLY valid JSON.

Problem title:
${title}

Problem statement:
${questionText}

Return exactly this JSON structure:

{
  "c": {
    "signature": "complete C function signature with empty body",
    "explanation": "short explanation of parameters, return value and memory requirements"
  },
  "python": {
    "signature": "complete Python function signature",
    "explanation": "short explanation of parameters and return value"
  },
  "java": {
    "signature": "complete Java method signature with empty body",
    "explanation": "short explanation of parameters and return value"
  }
}
`;

    /*
     * Call OpenAI directly.
     *
     * The API key exists only inside this server-side
     * Edge Function.
     */
    const openaiResponse =
      await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${openaiApiKey}`,
          },

          body: JSON.stringify({
            model: "gpt-4o-mini",

            messages: [
              {
                role: "system",
                content:
                  "You generate structured competitive-programming function interfaces. Return valid JSON only.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],

            temperature: 0.1,

            response_format: {
              type: "json_object",
            },
          }),
        },
      );

    const openaiText =
      await openaiResponse.text();

    if (!openaiResponse.ok) {
      throw new Error(
        `OpenAI API request failed (${openaiResponse.status}): ${openaiText}`,
      );
    }

    let openaiData: {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    try {
      openaiData =
        JSON.parse(openaiText);
    } catch {
      throw new Error(
        `OpenAI returned invalid JSON: ${openaiText}`,
      );
    }

    const content =
      openaiData
        ?.choices?.[0]
        ?.message
        ?.content;

    if (
      !content ||
      typeof content !== "string"
    ) {
      throw new Error(
        "OpenAI returned no usable message content.",
      );
    }

    const interfaces =
      extractJson(content);

    return jsonResponse(
      interfaces,
      200,
    );
  } catch (error) {
    console.error(
      "generate-round2-function error:",
      error,
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate function interfaces.",
      },
      500,
    );
  }
}
