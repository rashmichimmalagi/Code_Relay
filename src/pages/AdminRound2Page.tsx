import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { insforge } from "../lib/insforge";
import { useAuth } from "../context/AuthContext";

type Round2Phase =
  | "CONFIGURED"
  | "QUESTION"
  | "TRANSITION"
  | "CODING"
  | "ENDED";

type InterfaceStatus =
  | "DRAFT"
  | "APPROVED";

type Round2Question = {
  id: string;
  title: string;
  question_text: string;

  function_signature_c: string | null;
  function_signature_python: string | null;
  function_signature_java: string | null;

  interface_status: InterfaceStatus;
  interface_notes: string | null;
  interface_generated_at: string | null;
  interface_approved_at: string | null;
  interface_approved_by: string | null;

  created_by: string;
  created_at: string;
  updated_at: string;
};

type Round2Team = {
  id: string;
  team_number: number;
  team_name: string;
  status: string;
  student_1_name: string;
  student_2_name: string;
  student_3_name: string;
};

type Round2Session = {
  id: string;
  question_id: string | null;
  question_text: string;
  question_duration_seconds: number;
  coding_duration_seconds: number;
  student3_duration_seconds: number;

  /*
   * New independent extensions.
   */
  question_extension_seconds: number;
  coding_extension_seconds: number;
  student3_extension_seconds: number;
  coding_stage?: "STUDENT_2" | "STUDENT_3";

  /*
   * Kept for backward compatibility with
   * the existing database.
   */
  phase_extension_seconds: number;

  phase: Round2Phase;
  phase_started_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type QuestionForm = {
  title: string;
  question_text: string;
  function_signature_c: string;
  function_signature_python: string;
  function_signature_java: string;
  interface_notes: string;
};

const emptyQuestionForm: QuestionForm = {
  title: "",
  question_text: "",
  function_signature_c: "",
  function_signature_python: "",
  function_signature_java: "",
  interface_notes: "",
};

export default function AdminRound2Page() {
  const { user } = useAuth();

  const [session, setSession] =
    useState<Round2Session | null>(null);

  const [questions, setQuestions] =
    useState<Round2Question[]>([]);

  const [teams, setTeams] =
    useState<Round2Team[]>([]);

  const [questionForm, setQuestionForm] =
    useState<QuestionForm>(
      emptyQuestionForm,
    );

  const [questionMinutes, setQuestionMinutes] =
    useState(1);

  const [codingMinutes, setCodingMinutes] =
    useState(5);

  const [student3Minutes, setStudent3Minutes] =
    useState(15);

  const [questionExtensionMinutes, setQuestionExtensionMinutes] =
    useState(1);

  const [codingExtensionMinutes, setCodingExtensionMinutes] =
    useState(1);

  const [remainingSeconds, setRemainingSeconds] =
    useState<number | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [savingQuestion, setSavingQuestion] =
    useState(false);

  const [approvingQuestion, setApprovingQuestion] =
    useState<string | null>(null);

  const [starting, setStarting] =
    useState(false);

  const [continuing, setContinuing] =
    useState(false);

  const [extendingQuestion, setExtendingQuestion] =
    useState(false);

  const [extendingCoding, setExtendingCoding] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [editingQuestionId, setEditingQuestionId] =
    useState<string | null>(null);

  const [showQuestionForm, setShowQuestionForm] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * --------------------------------------------------
   * LOAD QUESTIONS
   * --------------------------------------------------
   */

  const loadQuestions =
    useCallback(async () => {
      try {
        const result =
          await insforge.database
            .from("round2_questions")
            .select(
              "id,title,question_text,function_signature_c,function_signature_python,function_signature_java,interface_status,interface_notes,interface_generated_at,interface_approved_at,interface_approved_by,created_by,created_at,updated_at",
            );

        if (result.error) {
          console.error(
            "Unable to load questions:",
            result.error,
          );

          setError(
            "Unable to load the Round 2 question bank.",
          );

          return;
        }

        const data =
          (result.data as Round2Question[]) ?? [];

        data.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        );

        setQuestions(data);
      } catch (err) {
        console.error(
          "Question loading failed:",
          err,
        );

        setError(
          "Unable to load the Round 2 question bank.",
        );
      }
    }, []);

  /*
   * --------------------------------------------------
   * LOAD TEAMS
   * --------------------------------------------------
   */

  const loadTeams =
    useCallback(async () => {
      try {
        const result =
          await insforge.database
            .from("teams")
            .select(
              "id,team_number,team_name,status,student_1_name,student_2_name,student_3_name",
            );

        if (result.error) {
          console.error(
            "Unable to load teams:",
            result.error,
          );

          setError(
            "Unable to load approved teams.",
          );

          return;
        }

        const data =
          (result.data as Round2Team[]) ?? [];

        const approvedTeams =
          data
            .filter(
              (team) =>
                team.status === "APPROVED",
            )
            .sort(
              (a, b) =>
                a.team_number -
                b.team_number,
            );

        setTeams(approvedTeams);
      } catch (err) {
        console.error(
          "Team loading failed:",
          err,
        );

        setError(
          "Unable to load approved teams.",
        );
      }
    }, []);

  /*
   * --------------------------------------------------
   * LOAD SESSION
   * --------------------------------------------------
   */

  const loadSession =
    useCallback(async () => {
      try {
        const result =
          await insforge.database
            .from("round2_sessions")
            .select("*");

        if (result.error) {
          console.error(
            "Unable to load Round 2 session:",
            result.error,
          );

          setError(
            "Unable to load the Round 2 session.",
          );

          return;
        }

        const sessions =
          (result.data as Round2Session[]) ?? [];

        const activeSessions =
          sessions
            .filter(
              (item) =>
                item.phase !== "ENDED",
            )
            .sort(
              (a, b) =>
                new Date(
                  b.created_at,
                ).getTime() -
                new Date(
                  a.created_at,
                ).getTime(),
            );

        const current =
          activeSessions.length > 0
            ? activeSessions[0]
            : null;

        setSession(current);

        if (current) {
          setQuestionMinutes(
            Math.max(
              1,
              Math.round(
                current.question_duration_seconds /
                  60,
              ),
            ),
          );

          setCodingMinutes(
            Math.max(
              1,
              Math.round(
                current.coding_duration_seconds /
                  60,
              ),
            ),
          );

          setStudent3Minutes(
            Math.max(
              1,
              Math.round(
                Number(current.student3_duration_seconds) /
                  60,
              ),
            ),
          );
        }
      } catch (err) {
        console.error(
          "Round 2 loading failed:",
          err,
        );

        setError(
          "Something went wrong while loading Round 2.",
        );
      }
    }, []);

  /*
   * --------------------------------------------------
   * INITIAL LOAD
   * --------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function loadEverything() {
      try {
        await Promise.all([
          loadQuestions(),
          loadTeams(),
          loadSession(),
        ]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEverything();

    return () => {
      cancelled = true;
    };
  }, [
    loadQuestions,
    loadTeams,
    loadSession,
  ]);

  /*
   * --------------------------------------------------
   * QUESTION RESOLUTION
   * --------------------------------------------------
   */

  function getApprovedQuestions() {
    return questions
      .filter(
        (question) =>
          question.interface_status ===
          "APPROVED",
      )
      .slice(0, 8);
  }

  function getQuestionForTeam(
    team: Round2Team,
  ) {
    const approvedQuestions =
      getApprovedQuestions();

    if (approvedQuestions.length < 8) {
      return null;
    }

    const index =
      (team.team_number - 1) % 8;

    return approvedQuestions[index] ?? null;
  }

  function getQuestionNumberForTeam(
    team: Round2Team,
  ) {
    if (team.team_number < 1) {
      return null;
    }

    return ((team.team_number - 1) % 8) + 1;
  }

  /*
   * --------------------------------------------------
   * QUESTION VALIDATION
   * --------------------------------------------------
   */

  const teamsMissingQuestions =
    useMemo(() => {
      return teams.filter(
        (team) =>
          getQuestionForTeam(team) ===
          null,
      );
    }, [teams, questions]);

  const questionsNotApproved =
    useMemo(() => {
      return teams
        .map((team) =>
          getQuestionForTeam(team),
        )
        .filter(
          (
            question,
          ): question is Round2Question =>
            question !== null &&
            question.interface_status !==
              "APPROVED",
        );
    }, [teams, questions]);

  const enoughQuestions =
    teams.length > 0 &&
    getApprovedQuestions().length >= 8 &&
    teamsMissingQuestions.length === 0;

  const allRequiredInterfacesApproved =
    enoughQuestions &&
    questionsNotApproved.length === 0;

  /*
   * --------------------------------------------------
   * DERIVED VALUES
   * --------------------------------------------------
   */

  const activeRoundStarted =
    session !== null &&
    session.phase !== "CONFIGURED";

  const formattedTime =
    useMemo(() => {
      if (
        remainingSeconds === null
      ) {
        return "--:--";
      }

      const minutes =
        Math.floor(
          remainingSeconds / 60,
        );

      const seconds =
        remainingSeconds % 60;

      return `${String(
        minutes,
      ).padStart(
        2,
        "0",
      )}:${String(
        seconds,
      ).padStart(
        2,
        "0",
      )}`;
    }, [
      remainingSeconds,
    ]);

  /*
   * --------------------------------------------------
   * LIVE TIMER
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      !session ||
      !session.phase_started_at ||
      (
        session.phase !== "QUESTION" &&
        session.phase !== "CODING"
      )
    ) {
      setRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const startedAt =
        new Date(
          session.phase_started_at!,
        ).getTime();

      const elapsedSeconds =
        Math.floor(
          (Date.now() -
            startedAt) /
            1000,
        );

      const codingStage =
        session.coding_stage ?? "STUDENT_2";

      const baseDuration =
        session.phase === "QUESTION"
          ? session.question_duration_seconds
          : codingStage === "STUDENT_3"
            ? Number(session.student3_duration_seconds)
            : session.coding_duration_seconds;

      const extensionDuration =
        session.phase === "QUESTION"
          ? Number(session.question_extension_seconds ?? 0)
          : codingStage === "STUDENT_3"
            ? Number(session.student3_extension_seconds ?? 0)
            : Number(session.coding_extension_seconds ?? 0);

      const totalDuration =
        Number(baseDuration) +
        extensionDuration;

      setRemainingSeconds(
        Math.max(
          0,
          totalDuration -
            elapsedSeconds,
        ),
      );
    };

    updateTimer();

    const interval =
      window.setInterval(
        updateTimer,
        1000,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [session]);

  /*
   * --------------------------------------------------
   * QUESTION TIMER -> TRANSITION
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      !session ||
      session.phase !== "QUESTION" ||
      remainingSeconds !== 0
    ) {
      return;
    }

    let cancelled = false;

    async function moveToTransition() {
      try {
        const result =
          await insforge.database
            .from("round2_sessions")
            .update({
              phase: "TRANSITION",
              phase_started_at: null,

              /*
               * Legacy field reset.
               */
              phase_extension_seconds: 0,
            })
            .eq(
              "id",
              session!.id,
            )
            .eq(
              "phase",
              "QUESTION",
            )
            .select()
            .maybeSingle();

        if (cancelled) {
          return;
        }

        if (result.error) {
          console.error(
            "Unable to move to transition:",
            result.error,
          );

          setError(
            "Unable to lock the question phase.",
          );

          return;
        }

        setMessage(
          "Question time is over. Students are locked.",
        );

        await loadSession();
      } catch (err) {
        if (!cancelled) {
          console.error(
            "Transition failed:",
            err,
          );

          setError(
            "Unable to move into transition.",
          );
        }
      }
    }

    void moveToTransition();

    return () => {
      cancelled = true;
    };
  }, [
    session,
    remainingSeconds,
    loadSession,
  ]);

  /*
   * --------------------------------------------------
   * QUESTION FORM
   * --------------------------------------------------
   */

  function startNewQuestion() {
    if (activeRoundStarted) {
      setError(
        "Questions cannot be added after Round 2 starts.",
      );
      return;
    }

    setEditingQuestionId(null);
    setQuestionForm(
      emptyQuestionForm,
    );
    setShowQuestionForm(true);
    setError(null);
    setMessage(null);
  }

  function editQuestion(
    question: Round2Question,
  ) {
    if (activeRoundStarted) {
      setError(
        "Questions cannot be edited after Round 2 starts.",
      );
      return;
    }

    setEditingQuestionId(
      question.id,
    );

    setQuestionForm({
      title: question.title,
      question_text:
        question.question_text,
      function_signature_c:
        question.function_signature_c ??
        "",
      function_signature_python:
        question.function_signature_python ??
        "",
      function_signature_java:
        question.function_signature_java ??
        "",
      interface_notes:
        question.interface_notes ??
        "",
    });

    setShowQuestionForm(true);
    setError(null);
    setMessage(null);
  }

  function cancelQuestionForm() {
    setQuestionForm(
      emptyQuestionForm,
    );
    setEditingQuestionId(null);
    setShowQuestionForm(false);
  }

  /*
   * --------------------------------------------------
   * SAVE QUESTION
   * --------------------------------------------------
   */

  async function saveQuestion() {
    if (!user) {
      setError(
        "You must be logged in as an admin.",
      );
      return;
    }

    if (activeRoundStarted) {
      setError(
        "Questions cannot be changed after Round 2 starts.",
      );
      return;
    }

    if (
      !questionForm.title.trim()
    ) {
      setError(
        "Please enter a question title.",
      );
      return;
    }

    if (
      !questionForm.question_text.trim()
    ) {
      setError(
        "Please enter the complete question.",
      );
      return;
    }

    if (
      !questionForm.function_signature_c.trim()
    ) {
      setError(
        "Please enter the C function signature.",
      );
      return;
    }

    if (
      !questionForm.function_signature_python.trim()
    ) {
      setError(
        "Please enter the Python function signature.",
      );
      return;
    }

    if (
      !questionForm.function_signature_java.trim()
    ) {
      setError(
        "Please enter the Java function signature.",
      );
      return;
    }

    setSavingQuestion(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        title:
          questionForm.title.trim(),

        question_text:
          questionForm.question_text.trim(),

        function_signature_c:
          questionForm.function_signature_c.trim(),

        function_signature_python:
          questionForm.function_signature_python.trim(),

        function_signature_java:
          questionForm.function_signature_java.trim(),

        interface_notes:
          questionForm.interface_notes.trim() ||
          null,

        interface_status:
          "DRAFT",

        interface_generated_at:
          null,

        interface_approved_at:
          null,

        interface_approved_by:
          null,
      };

      if (editingQuestionId) {
        const result =
          await insforge.database
            .from("round2_questions")
            .update(payload)
            .eq(
              "id",
              editingQuestionId,
            )
            .select()
            .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        setMessage(
          "Question updated. Interface approval was reset to DRAFT.",
        );
      } else {
        const result =
          await insforge.database
            .from("round2_questions")
            .insert({
              ...payload,
              created_by: user.id,
            })
            .select()
            .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        setMessage(
          "Question added successfully.",
        );
      }

      cancelQuestionForm();

      await loadQuestions();
    } catch (err) {
      console.error(
        "Unable to save question:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to save the question.",
      );
    } finally {
      setSavingQuestion(false);
    }
  }

  /*
   * --------------------------------------------------
   * APPROVE INTERFACE
   * --------------------------------------------------
   */

  async function approveInterface(
    question: Round2Question,
  ) {
    if (!user) {
      setError(
        "You must be logged in as an admin.",
      );
      return;
    }

    if (activeRoundStarted) {
      setError(
        "Interfaces cannot be approved after Round 2 starts.",
      );
      return;
    }

    if (
      !question.function_signature_c?.trim()
    ) {
      setError(
        "C function signature is required.",
      );
      return;
    }

    if (
      !question.function_signature_python?.trim()
    ) {
      setError(
        "Python function signature is required.",
      );
      return;
    }

    if (
      !question.function_signature_java?.trim()
    ) {
      setError(
        "Java function signature is required.",
      );
      return;
    }

    setApprovingQuestion(
      question.id,
    );
    setError(null);
    setMessage(null);

    try {
      const result =
        await insforge.database
          .from("round2_questions")
          .update({
            interface_status:
              "APPROVED",

            interface_approved_at:
              new Date().toISOString(),

            interface_approved_by:
              user.id,
          })
          .eq(
            "id",
            question.id,
          )
          .select()
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      setMessage(
        `"${question.title}" interface approved.`,
      );

      await loadQuestions();
    } catch (err) {
      console.error(
        "Unable to approve interface:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to approve the interface.",
      );
    } finally {
      setApprovingQuestion(null);
    }
  }

  /*
   * --------------------------------------------------
   * DELETE QUESTION
   * --------------------------------------------------
   */

  async function deleteQuestion(
    question: Round2Question,
  ) {
    if (activeRoundStarted) {
      setError(
        "Questions cannot be deleted after Round 2 starts.",
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${question.title}"? This cannot be undone.`,
      );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const result =
        await insforge.database
          .from("round2_questions")
          .delete()
          .eq(
            "id",
            question.id,
          );

      if (result.error) {
        throw result.error;
      }

      setMessage(
        "Question deleted successfully.",
      );

      await loadQuestions();
    } catch (err) {
      console.error(
        "Unable to delete question:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete the question.",
      );
    } finally {
      setDeleting(false);
    }
  }

  /*
   * --------------------------------------------------
   * SAVE ROUND CONFIGURATION
   * --------------------------------------------------
   */

  async function saveConfiguration() {
    if (!user) {
      setError(
        "You must be logged in as an admin.",
      );
      return;
    }

    if (teams.length === 0) {
      setError(
        "No approved teams are available.",
      );
      return;
    }

    if (!enoughQuestions) {
      const missingNumbers =
        teamsMissingQuestions
          .map(
            (team) =>
              `Team ${team.team_number}`,
          )
          .join(", ");

      setError(
        `Not enough questions for: ${missingNumbers}.`,
      );

      return;
    }

    if (
      !allRequiredInterfacesApproved
    ) {
      const questionNumbers =
        questionsNotApproved
          .map(
            (question) =>
              questions.findIndex(
                (item) =>
                  item.id ===
                  question.id,
              ) + 1,
          )
          .join(", ");

      setError(
        `Approve the interfaces for Question ${questionNumbers} before configuring Round 2.`,
      );

      return;
    }

    if (
      questionMinutes < 1 ||
      codingMinutes < 1 ||
      student3Minutes < 1
    ) {
      setError(
        "All three timers must be at least 1 minute.",
      );
      return;
    }

    if (
      session &&
      session.phase !== "CONFIGURED"
    ) {
      setError(
        "Round configuration cannot be changed after it starts.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const firstQuestion =
        questions.length > 0
          ? questions[0]
          : null;

      const payload = {
        question_id:
          firstQuestion?.id ?? null,

        question_text:
          firstQuestion
            ? `${firstQuestion.title}\n\n${firstQuestion.question_text}`
            : "",

        question_duration_seconds:
          questionMinutes * 60,

        coding_duration_seconds:
          codingMinutes * 60,

        student3_duration_seconds:
          student3Minutes * 60,

        question_extension_seconds: 0,

        coding_extension_seconds: 0,
        student3_extension_seconds: 0,
        coding_stage: "STUDENT_2",

        /*
         * Legacy field.
         */
        phase_extension_seconds: 0,

        phase_started_at: null,
      };

      if (!session) {
        const result =
          await insforge.database
            .from("round2_sessions")
            .insert({
              ...payload,
              phase: "CONFIGURED",
              created_by: user.id,
            })
            .select()
            .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        if (!result.data) {
          throw new Error(
            "Round 2 configuration was not created.",
          );
        }

        setSession(
          result.data as Round2Session,
        );

        setMessage(
          "Round 2 configuration saved.",
        );
      } else {
        const result =
          await insforge.database
            .from("round2_sessions")
            .update(payload)
            .eq(
              "id",
              session.id,
            )
            .eq(
              "phase",
              "CONFIGURED",
            )
            .select()
            .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        if (!result.data) {
          throw new Error(
            "Round 2 configuration was not updated.",
          );
        }

        setSession(
          result.data as Round2Session,
        );

        setMessage(
          "Round 2 configuration updated.",
        );
      }

      await loadSession();
    } catch (err) {
      console.error(
        "Unable to save configuration:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to save the Round 2 configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * --------------------------------------------------
   * START QUESTION
   * --------------------------------------------------
   */

  async function startQuestion() {
    if (!session) {
      setError(
        "Configure Round 2 first.",
      );
      return;
    }

    if (session.phase !== "CONFIGURED") {
      setError(
        "Question can only start from CONFIGURED.",
      );
      return;
    }

    if (!enoughQuestions) {
      setError(
        "Add enough questions for all approved teams.",
      );
      return;
    }

    if (
      !allRequiredInterfacesApproved
    ) {
      setError(
        "All team questions must have approved interfaces before starting.",
      );
      return;
    }

    setStarting(true);
    setError(null);
    setMessage(null);

    try {
      const result =
        await insforge.database
          .from("round2_sessions")
          .update({
            phase: "QUESTION",
            phase_started_at:
              new Date().toISOString(),

            question_extension_seconds: 0,
            coding_extension_seconds: 0,
            coding_stage: "STUDENT_2",

            /*
             * Legacy field reset.
             */
            phase_extension_seconds: 0,
          })
          .eq(
            "id",
            session.id,
          )
          .eq(
            "phase",
            "CONFIGURED",
          )
          .select()
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error(
          "Question phase could not be started.",
        );
      }

      setMessage(
        "Question viewing phase started.",
      );

      await loadSession();
    } catch (err) {
      console.error(
        "Unable to start question:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to start the question phase.",
      );
    } finally {
      setStarting(false);
    }
  }

  /*
   * --------------------------------------------------
   * CONTINUE TO EDITOR
   * --------------------------------------------------
   */

  async function continueToEditor() {
    if (!session) {
      return;
    }

    if (
      session.phase !== "TRANSITION"
    ) {
      setError(
        "Round 2 is not waiting to continue.",
      );
      return;
    }

    setContinuing(true);
    setError(null);
    setMessage(null);

    try {
      const result =
        await insforge.database
          .from("round2_sessions")
          .update({
            phase: "CODING",
            phase_started_at:
              new Date().toISOString(),

            /*
             * Coding starts with its own
             * extension value.
             */
            coding_extension_seconds: 0,
            coding_stage: "STUDENT_2",

            /*
             * Question extension is no longer
             * relevant once question phase ends.
             */
            question_extension_seconds: 0,

            /*
             * Legacy field reset.
             */
            phase_extension_seconds: 0,
          })
          .eq(
            "id",
            session.id,
          )
          .eq(
            "phase",
            "TRANSITION",
          )
          .select()
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error(
          "Coding phase could not be started.",
        );
      }

      setMessage(
        "Coding phase started. Student 2 can now access the editor.",
      );

      await loadSession();
    } catch (err) {
      console.error(
        "Unable to continue to editor:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to continue to the editor.",
      );
    } finally {
      setContinuing(false);
    }
  }

  /*
   * --------------------------------------------------
   * CONTINUE TO STUDENT 3
   * --------------------------------------------------
   */

  async function continueToStudent3() {
    if (!session) return;

    if (session.phase !== "CODING" || (session.coding_stage ?? "STUDENT_2") !== "STUDENT_2") {
      setError("Student 3 can only start after Student 2's coding phase.");
      return;
    }

    if (remainingSeconds !== 0) {
      setError("Wait until Student 2's coding timer reaches 00:00.");
      return;
    }

    setContinuing(true);
    setError(null);
    setMessage(null);

    try {
      const result = await insforge.database
        .from("round2_sessions")
        .update({
          phase: "CODING",
          coding_stage: "STUDENT_3",
          phase_started_at: new Date().toISOString(),
          coding_extension_seconds: 0,
          student3_extension_seconds: 0,
          question_extension_seconds: 0,
          phase_extension_seconds: 0,
        })
        .eq("id", session.id)
        .eq("phase", "CODING")
        .eq("coding_stage", "STUDENT_2")
        .select()
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error("Student 3 phase could not be started.");

      setMessage("Student 3 debugging phase started. The question and saved code are now available to Student 3.");
      await loadSession();
    } catch (err) {
      console.error("Unable to continue to Student 3:", err);
      setError(err instanceof Error ? err.message : "Unable to continue to Student 3.");
    } finally {
      setContinuing(false);
    }
  }

  /*
   * --------------------------------------------------
   * EXTEND QUESTION TIME
   * --------------------------------------------------
   */

  async function extendQuestionTime(
    minutes: number,
  ) {
    if (!session) {
      return;
    }

    if (session.phase !== "QUESTION") {
      setError(
        "Question time can only be extended during the Question phase.",
      );
      return;
    }

    if (minutes <= 0) {
      return;
    }

    setExtendingQuestion(true);
    setError(null);
    setMessage(null);

    try {
      const addedSeconds =
        minutes * 60;

      const currentExtension =
        Number(
          session.question_extension_seconds ??
            0,
        );

      const result =
        await insforge.database
          .from("round2_sessions")
          .update({
            question_extension_seconds:
              currentExtension +
              addedSeconds,

            /*
             * Keep legacy field synchronized
             * for compatibility.
             */
            phase_extension_seconds:
              currentExtension +
              addedSeconds,
          })
          .eq(
            "id",
            session.id,
          )
          .eq(
            "phase",
            "QUESTION",
          )
          .select()
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error(
          "Question time extension was not saved.",
        );
      }

      setMessage(
        `Added ${minutes} minute${
          minutes === 1 ? "" : "s"
        } to Student 1's question time.`,
      );

      await loadSession();
    } catch (err) {
      console.error(
        "Unable to extend question time:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to extend question time.",
      );
    } finally {
      setExtendingQuestion(false);
    }
  }

  /*
   * --------------------------------------------------
   * EXTEND CODING TIME
   * --------------------------------------------------
   */

  async function extendCodingTime(
    minutes: number,
  ) {
    if (!session) {
      return;
    }

    if (session.phase !== "CODING") {
      setError(
        "Coding time can only be extended during the Coding phase.",
      );
      return;
    }

    if (minutes <= 0) {
      return;
    }

    setExtendingCoding(true);
    setError(null);
    setMessage(null);

    try {
      const addedSeconds = minutes * 60;
      const stage = session.coding_stage ?? "STUDENT_2";

      const currentExtension =
        stage === "STUDENT_3"
          ? Number(session.student3_extension_seconds ?? 0)
          : Number(session.coding_extension_seconds ?? 0);

      const updatePayload =
        stage === "STUDENT_3"
          ? {
              student3_extension_seconds:
                currentExtension + addedSeconds,
              phase_extension_seconds:
                currentExtension + addedSeconds,
            }
          : {
              coding_extension_seconds:
                currentExtension + addedSeconds,
              phase_extension_seconds:
                currentExtension + addedSeconds,
            };

      const result = await insforge.database
        .from("round2_sessions")
        .update(updatePayload)
        .eq("id", session.id)
        .eq("phase", "CODING")
        .eq("coding_stage", stage)
        .select()
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error("Coding time extension was not saved.");
      }

      setMessage(
        `Added ${minutes} minute${minutes === 1 ? "" : "s"} to ${
          stage === "STUDENT_3" ? "Student 3" : "Student 2"
        }'s coding time.`,
      );

      await loadSession();
    } catch (err) {
      console.error("Unable to extend coding time:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to extend coding time.",
      );
    } finally {
      setExtendingCoding(false);
    }
  }

  /*
   * --------------------------------------------------
   * END ROUND
   * --------------------------------------------------
   */

  async function endRound() {
    if (!session) {
      return;
    }

    if (session.phase !== "CODING") {
      setError(
        "Round 2 can only be ended during coding.",
      );
      return;
    }

    const confirmed =
      window.confirm(
        "End Round 2? Students will no longer be able to code.",
      );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const result =
        await insforge.database
          .from("round2_sessions")
          .update({
            phase: "ENDED",
            phase_started_at: null,
            question_extension_seconds: 0,
            coding_extension_seconds: 0,
            student3_extension_seconds: 0,
            phase_extension_seconds: 0,
          })
          .eq(
            "id",
            session.id,
          )
          .eq(
            "phase",
            "CODING",
          )
          .select()
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error(
          "Round 2 could not be ended.",
        );
      }

      setMessage(
        "Round 2 has ended.",
      );

      await loadSession();
    } catch (err) {
      console.error(
        "Unable to end Round 2:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to end Round 2.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * --------------------------------------------------
   * END & RESTART ROUND
   * --------------------------------------------------
   *
   * This does not delete teams or questions. It ends the
   * current live session and creates a completely new
   * CONFIGURED session so the next Start Question action
   * begins again with Student 1.
   */

  async function restartRound2() {
    if (!session || !user) {
      setError("No active Round 2 session found.");
      return;
    }

    if (session.phase === "CONFIGURED") {
      setMessage("Round 2 is already configured and ready to start.");
      return;
    }

    if (session.phase === "ENDED") {
      setError("This Round 2 session has already ended.");
      return;
    }

    const confirmed = window.confirm(
      "End the current Round 2 and restart it completely from Student 1?\n\n" +
        "The current live session will be ended and a new clean Round 2 session will be created. Teams and questions will not be deleted.",
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const endResult = await insforge.database
        .from("round2_sessions")
        .update({
          phase: "ENDED",
          phase_started_at: null,
          question_extension_seconds: 0,
          coding_extension_seconds: 0,
          phase_extension_seconds: 0,
        })
        .eq("id", session.id)
        .neq("phase", "ENDED")
        .select()
        .maybeSingle();

      if (endResult.error) {
        throw endResult.error;
      }

      if (!endResult.data) {
        throw new Error("The current Round 2 session could not be ended.");
      }

      const newSessionPayload = {
        question_id: session.question_id,
        question_text: session.question_text,
        question_duration_seconds: Number(
          session.question_duration_seconds,
        ),
        coding_duration_seconds: Number(
          session.coding_duration_seconds,
        ),
        student3_duration_seconds: Number(
          session.student3_duration_seconds,
        ),
        question_extension_seconds: 0,
        coding_extension_seconds: 0,
        student3_extension_seconds: 0,
        coding_stage: "STUDENT_2",
        phase_extension_seconds: 0,
        phase: "CONFIGURED",
        phase_started_at: null,
        created_by: user.id,
      };

      const createResult = await insforge.database
        .from("round2_sessions")
        .insert(newSessionPayload)
        .select()
        .maybeSingle();

      if (createResult.error) {
        throw createResult.error;
      }

      if (!createResult.data) {
        throw new Error(
          "The new Round 2 session could not be created.",
        );
      }

      setSession(createResult.data as Round2Session);
      setRemainingSeconds(null);
      setMessage(
        "Round 2 restarted successfully. It is ready to start from Student 1.",
      );

      await loadSession();
    } catch (err) {
      console.error("Unable to restart Round 2:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to restart Round 2.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * --------------------------------------------------
   * LOADING
   * --------------------------------------------------
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />

            <p className="text-sm text-slate-400">
              Loading Round 2 control...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * PAGE
   * --------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <div className="mb-8">
          <p className="text-sm font-medium text-cyan-400">
            CodeRelay Administration
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Round 2 — Code Relay
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Manage the question bank, approve the
            official function interfaces, and control
            the live relay phases.
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4">
            <p className="text-sm text-red-300">
              {error}
            </p>
          </div>
        )}

        {/* SUCCESS */}

        {message && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-sm text-emerald-300">
              {message}
            </p>
          </div>
        )}

        {/* LIVE SESSION */}

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Live Round 2
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                {session
                  ? session.phase
                  : "CONFIGURED"}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {session?.phase ===
                  "QUESTION" &&
                  "Student 1 has access to the question."}

                {session?.phase ===
                  "TRANSITION" &&
                  "Students are locked. Continue when ready."}

                {session?.phase ===
                  "CODING" &&
                  ((session.coding_stage ?? "STUDENT_2") === "STUDENT_2"
                    ? "Student 2 has access to the coding editor."
                    : "Student 3 has access to the question, saved code, and coding tools.")}

                {session?.phase ===
                  "CONFIGURED" &&
                  "Round 2 is configured and ready to start."}

                {!session &&
                  "Create the Round 2 configuration below."}
              </p>
            </div>

            {(session?.phase ===
              "QUESTION" ||
              session?.phase ===
                "CODING") && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-6 py-4 text-center">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Time Remaining
                </p>

                <p className="mt-2 font-mono text-4xl font-bold text-cyan-300">
                  {formattedTime}
                </p>
              </div>
            )}

          {session &&
            session.phase !== "CONFIGURED" &&
            session.phase !== "ENDED" && (
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void restartRound2()}
                  disabled={saving}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Restarting Round 2..."
                    : "End & Restart Round 2"}
                </button>
              </div>
            )}
          </div>

          {/* CONFIGURATION */}

          {(!session ||
            session.phase ===
              "CONFIGURED") && (
            <div className="mt-7">

              <div className="grid gap-5 sm:grid-cols-2">

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Question viewing time
                  </span>

                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={
                        questionMinutes
                      }
                      onChange={(event) =>
                        setQuestionMinutes(
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                      className="w-28 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                    />

                    <span className="text-sm text-slate-500">
                      minutes
                    </span>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Student 2 — Coding time
                  </span>

                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={
                        codingMinutes
                      }
                      onChange={(event) =>
                        setCodingMinutes(
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                      className="w-28 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                    />

                    <span className="text-sm text-slate-500">
                      minutes
                    </span>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Student 3 — Debug & Submit time
                  </span>

                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={
                        student3Minutes
                      }
                      onChange={(event) =>
                        setStudent3Minutes(
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                      className="w-28 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                    />

                    <span className="text-sm text-slate-500">
                      minutes
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() =>
                    void saveConfiguration()
                  }
                  disabled={
                    saving ||
                    !enoughQuestions ||
                    !allRequiredInterfacesApproved
                  }
                  className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving
                    ? "Saving..."
                    : "Save Configuration"}
                </button>

                {session && (
                  <button
                    type="button"
                    onClick={() =>
                      void startQuestion()
                    }
                    disabled={
                      starting ||
                      !enoughQuestions ||
                      !allRequiredInterfacesApproved
                    }
                    className="rounded-xl bg-emerald-400 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {starting
                      ? "Starting..."
                      : "Start Question"}
                  </button>
                )}
              </div>

              {!enoughQuestions &&
                teams.length > 0 && (
                  <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                    <p className="text-sm font-medium text-amber-300">
                      Add more questions before
                      starting Round 2.
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Team numbers determine
                      question numbers.
                    </p>
                  </div>
                )}

              {enoughQuestions &&
                !allRequiredInterfacesApproved && (
                  <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                    <p className="text-sm font-medium text-amber-300">
                      Approve every question
                      interface required by the
                      approved teams.
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* QUESTION TIMER CONTROLS */}

          {session?.phase ===
            "QUESTION" && (
            <div className="mt-7 border-t border-white/10 pt-6">

              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    Student 1 — Question Time
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Extend only the question viewing
                    and explanation phase.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">

                  {[1, 5, 10].map(
                    (minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() =>
                          void extendQuestionTime(
                            minutes,
                          )
                        }
                        disabled={
                          extendingQuestion
                        }
                        className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {extendingQuestion
                          ? "Adding..."
                          : `+${minutes} min`}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <span className="text-slate-500">
                    Base:{" "}
                    <strong className="text-slate-300">
                      {Math.floor(
                        session.question_duration_seconds /
                          60,
                      )}{" "}
                      min
                    </strong>
                  </span>

                  <span className="text-slate-500">
                    Added:{" "}
                    <strong className="text-cyan-300">
                      {Math.floor(
                        Number(
                          session.question_extension_seconds ??
                            0,
                        ) / 60,
                      )}{" "}
                      min
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* CODING TIMER CONTROLS */}

          {session?.phase ===
            "CODING" && (
            <div className="mt-7 border-t border-white/10 pt-6">

              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    {(session.coding_stage ?? "STUDENT_2") === "STUDENT_2"
                      ? "Student 2 — Coding Time"
                      : "Student 3 — Debug & Submit Time"}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {(session.coding_stage ?? "STUDENT_2") === "STUDENT_2"
                      ? "Student 2 writes the solution. Continue to Student 3 after the timer reaches 00:00."
                      : "Student 3 debugs the saved code, runs it, and submits the final solution."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">

                  {[1, 5, 10].map(
                    (minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() =>
                          void extendCodingTime(
                            minutes,
                          )
                        }
                        disabled={
                          extendingCoding
                        }
                        className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {extendingCoding
                          ? "Adding..."
                          : `+${minutes} min`}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <span className="text-slate-500">
                    Base:{" "}
                    <strong className="text-slate-300">
                      {Math.floor(
                        Number(
                          (session.coding_stage ?? "STUDENT_2") === "STUDENT_3"
                            ? session.student3_duration_seconds
                            : session.coding_duration_seconds,
                        ) / 60,
                      )}{" "}
                      min
                    </strong>
                  </span>

                  <span className="text-slate-500">
                    Added:{" "}
                    <strong className="text-emerald-300">
                      {Math.floor(
                        Number(
                          (session.coding_stage ?? "STUDENT_2") === "STUDENT_3"
                            ? (session.student3_extension_seconds ?? 0)
                            : (session.coding_extension_seconds ?? 0),
                        ) / 60,
                      )}{" "}
                      min
                    </strong>
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {(session.coding_stage ?? "STUDENT_2") === "STUDENT_2" ? (
                  <button
                    type="button"
                    onClick={() => void continueToStudent3()}
                    disabled={continuing || saving || remainingSeconds !== 0}
                    className="rounded-xl bg-emerald-400 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {continuing ? "Starting Student 3..." : "Continue to Student 3"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void endRound()}
                    disabled={saving}
                    className="rounded-lg bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-400/20 disabled:opacity-50"
                  >
                    End Round 2
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* TRANSITION */}

        {session?.phase ===
          "TRANSITION" && (
          <section className="mb-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6">

            <p className="text-xs font-medium uppercase tracking-wider text-amber-400">
              QUESTION TIME OVER
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Students Are Locked
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              The question timer has ended.
              Student 1 no longer has access to
              the question. Student 2 cannot access
              the editor yet. Student 3 remains
              locked.
            </p>

            <p className="mt-3 text-sm font-medium text-slate-300">
              Continue whenever you are ready.
              There is no automatic transition.
            </p>

            <button
              type="button"
              onClick={() =>
                void continueToEditor()
              }
              disabled={continuing}
              className="mt-6 rounded-xl bg-amber-400 px-7 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {continuing
                ? "Starting Editor..."
                : "Continue to Editor"}
            </button>
          </section>
        )}

        {/* TEAM / QUESTION MAPPING */}

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6">

          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Automatic Mapping
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              Team → Question
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              No manual assignment is required.
              Teams 1–8 receive Questions 1–8.
              Team 9 starts again with Question 1,
              Team 10 gets Question 2, and the pattern
              repeats for every additional team.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {teams.map((team) => {
              const question =
                getQuestionForTeam(team);

              return (
                <div
                  key={team.id}
                  className="rounded-xl border border-white/10 bg-slate-950/60 p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Team {team.team_number}
                  </p>

                  <p className="mt-1 font-semibold text-white">
                    {team.team_name}
                  </p>

                  <div className="mt-4 border-t border-white/10 pt-3">
                    <p className="text-xs text-slate-500">
                      Question{" "}
                      {getQuestionNumberForTeam(team) ?? "—"}
                    </p>

                    {question ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-slate-200">
                          {question.title}
                        </p>

                        <p
                          className={`mt-2 text-xs ${
                            question.interface_status ===
                            "APPROVED"
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {question.interface_status ===
                          "APPROVED"
                            ? "Interface approved"
                            : "Interface needs approval"}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-red-300">
                        Missing question
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {teams.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center">
              <p className="text-sm text-slate-400">
                No approved teams are available.
              </p>
            </div>
          )}

          {teamsMissingQuestions.length >
            0 && (
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-sm font-medium text-amber-300">
                Missing questions for{" "}
                {teamsMissingQuestions
                  .map(
                    (team) =>
                      `Team ${team.team_number}`,
                  )
                  .join(", ")}
                .
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                The first 8 approved questions are used.
                Teams 1–8 receive Questions 1–8;
                Team 9 receives Question 1, Team 10 receives
                Question 2, and the pattern repeats.
              </p>
            </div>
          )}
        </section>

        {/* QUESTION BANK */}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Round 2
              </p>

              <h2 className="mt-1 text-xl font-semibold">
                Question Bank
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Add each problem and manually define
                its official C, Python, and Java
                function interfaces.
              </p>
            </div>

            <button
              type="button"
              onClick={startNewQuestion}
              disabled={activeRoundStarted}
              className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add Question
            </button>
          </div>

          {/* QUESTION FORM */}

          {showQuestionForm && (
            <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-6">

              <div className="flex items-start justify-between gap-4">

                <div>
                  <h3 className="text-lg font-semibold">
                    {editingQuestionId
                      ? "Edit Question"
                      : "Add New Question"}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Define the problem and the exact
                    function signatures students will
                    implement.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    cancelQuestionForm
                  }
                  className="text-sm text-slate-500 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-6 space-y-5">

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Question Title
                  </span>

                  <input
                    value={
                      questionForm.title
                    }
                    onChange={(event) =>
                      setQuestionForm(
                        (current) => ({
                          ...current,
                          title:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="Two Sum"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Complete Question
                  </span>

                  <textarea
                    value={
                      questionForm.question_text
                    }
                    onChange={(event) =>
                      setQuestionForm(
                        (current) => ({
                          ...current,
                          question_text:
                            event.target.value,
                        }),
                      )
                    }
                    rows={18}
                    placeholder="Enter the complete problem statement, examples, constraints, etc."
                    className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-4 py-3 font-mono text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  />
                </label>

                <div className="border-t border-white/10 pt-6">

                  <div>
                    <p className="text-sm font-semibold text-white">
                      Official Function Interfaces
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      These are manually defined by the
                      admin. Students see the selected
                      signature as read-only.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-3">

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        C Function Signature
                      </span>

                      <textarea
                        value={
                          questionForm.function_signature_c
                        }
                        onChange={(event) =>
                          setQuestionForm(
                            (current) => ({
                              ...current,
                              function_signature_c:
                                event.target.value,
                            }),
                          )
                        }
                        rows={5}
                        placeholder={`int twoSum(int* nums, int numsSize, int target, int* returnSize)`}
                        className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-4 py-3 font-mono text-sm leading-6 text-cyan-300 outline-none placeholder:text-slate-700 focus:border-cyan-400/50"
                      />

                      <p className="mt-2 text-xs text-slate-600">
                        Student does not write main().
                      </p>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Python Function Signature
                      </span>

                      <textarea
                        value={
                          questionForm.function_signature_python
                        }
                        onChange={(event) =>
                          setQuestionForm(
                            (current) => ({
                              ...current,
                              function_signature_python:
                                event.target.value,
                            }),
                          )
                        }
                        rows={5}
                        placeholder={`def two_sum(nums, target):`}
                        className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-4 py-3 font-mono text-sm leading-6 text-cyan-300 outline-none placeholder:text-slate-700 focus:border-cyan-400/50"
                      />

                      <p className="mt-2 text-xs text-slate-600">
                        Student does not write input() or print().
                      </p>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Java Function Signature
                      </span>

                      <textarea
                        value={
                          questionForm.function_signature_java
                        }
                        onChange={(event) =>
                          setQuestionForm(
                            (current) => ({
                              ...current,
                              function_signature_java:
                                event.target.value,
                            }),
                          )
                        }
                        rows={5}
                        placeholder={`public int[] twoSum(int[] nums, int target)`}
                        className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-4 py-3 font-mono text-sm leading-6 text-cyan-300 outline-none placeholder:text-slate-700 focus:border-cyan-400/50"
                      />

                      <p className="mt-2 text-xs text-slate-600">
                        Student does not write main().
                      </p>
                    </label>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Interface Notes
                    <span className="ml-2 text-xs font-normal text-slate-600">
                      optional
                    </span>
                  </span>

                  <textarea
                    value={
                      questionForm.interface_notes
                    }
                    onChange={(event) =>
                      setQuestionForm(
                        (current) => ({
                          ...current,
                          interface_notes:
                            event.target.value,
                        }),
                      )
                    }
                    rows={3}
                    placeholder="Optional admin notes about the interface."
                    className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() =>
                    void saveQuestion()
                  }
                  disabled={savingQuestion}
                  className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingQuestion
                    ? "Saving..."
                    : editingQuestionId
                      ? "Save Question"
                      : "Add Question"}
                </button>

                <button
                  type="button"
                  onClick={
                    cancelQuestionForm
                  }
                  disabled={savingQuestion}
                  className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* QUESTION LIST */}

          <div className="mt-6 space-y-4">

            {questions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
                <p className="font-medium text-slate-300">
                  No questions yet
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Add your first Round 2 question.
                </p>
              </div>
            ) : (
              questions.map(
                (question, index) => {
                  const questionNumber =
                    index + 1;

                  const teamsUsingQuestion =
                    teams.filter((team) => {
                      const assignedQuestion =
                        getQuestionForTeam(team);

                      return assignedQuestion?.id ===
                        question.id;
                    });

                  return (
                    <div
                      key={question.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"
                    >

                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                        <div className="min-w-0">

                          <div className="flex flex-wrap items-center gap-2">

                            <span className="rounded-md bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-300">
                              Question{" "}
                              {questionNumber}
                            </span>

                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                question.interface_status ===
                                "APPROVED"
                                  ? "bg-emerald-400/10 text-emerald-300"
                                  : "bg-amber-400/10 text-amber-300"
                              }`}
                            >
                              {
                                question.interface_status
                              }
                            </span>

                            {teamsUsingQuestion.length >
                              0 && (
                              <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-400">
                                {teamsUsingQuestion.length === 1
                                  ? "Team"
                                  : "Teams"}{" "}
                                {teamsUsingQuestion
                                  .map((team) => team.team_number)
                                  .join(", ")}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-lg font-semibold text-white">
                            {question.title}
                          </h3>

                          <p className="mt-3 max-h-32 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-slate-400">
                            {
                              question.question_text
                            }
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              editQuestion(
                                question,
                              )
                            }
                            disabled={
                              activeRoundStarted
                            }
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void deleteQuestion(
                                question,
                              )
                            }
                            disabled={
                              deleting ||
                              activeRoundStarted
                            }
                            className="rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 lg:grid-cols-3">

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs uppercase tracking-wider text-slate-600">
                            C
                          </p>

                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-cyan-300">
                            {question.function_signature_c ||
                              "Not defined"}
                          </pre>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs uppercase tracking-wider text-slate-600">
                            Python
                          </p>

                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-cyan-300">
                            {question.function_signature_python ||
                              "Not defined"}
                          </pre>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs uppercase tracking-wider text-slate-600">
                            Java
                          </p>

                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-cyan-300">
                            {question.function_signature_java ||
                              "Not defined"}
                          </pre>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">

                        <div>
                          {question.interface_status ===
                          "APPROVED" ? (
                            <>
                              <p className="text-sm font-semibold text-emerald-300">
                                Interface approved
                              </p>

                              {question.interface_approved_at && (
                                <p className="mt-1 text-xs text-slate-600">
                                  Approved at{" "}
                                  {new Date(
                                    question.interface_approved_at,
                                  ).toLocaleString()}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-amber-300">
                                Interface requires approval
                              </p>

                              <p className="mt-1 text-xs text-slate-600">
                                Review all three
                                signatures before
                                approving.
                              </p>
                            </>
                          )}
                        </div>

                        {question.interface_status !==
                          "APPROVED" && (
                          <button
                            type="button"
                            onClick={() =>
                              void approveInterface(
                                question,
                              )
                            }
                            disabled={
                              approvingQuestion ===
                              question.id
                            }
                            className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {approvingQuestion ===
                            question.id
                              ? "Approving..."
                              : "Approve Interface"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </section>

        {/* ENDED */}

        {session?.phase ===
          "ENDED" && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-xl font-semibold">
              Round 2 Ended
            </p>

            <p className="mt-2 text-sm text-slate-400">
              This Round 2 session has finished.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}