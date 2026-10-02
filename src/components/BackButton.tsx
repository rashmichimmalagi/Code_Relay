import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type BackButtonProps = {
  fallback: string;
  preferHistory?: boolean;
  iconOnly?: boolean;
  className?: string;
};

export function BackButton({
  fallback,
  preferHistory = true,
  iconOnly = false,
  className = "",
}: BackButtonProps) {
  const navigate = useNavigate();

  function goBack() {
    const index = window.history.state?.idx;
    if (
      preferHistory &&
      typeof index === "number" &&
      index > 0
    ) {
      navigate(-1);
      return;
    }

    navigate(fallback);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={iconOnly ? "Go back" : undefined}
      className={`inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white ${className}`}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {!iconOnly && "Back"}
    </button>
  );
}
