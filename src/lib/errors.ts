type UnknownError = {
  message?: string;
  error?: string;
  code?: string;
};

export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const candidate = error as UnknownError;
  if (candidate.code === "23505") return "That team number is already registered. Please use the number assigned to your team.";
  return candidate.message || candidate.error || fallback;
}
