interface AuthAlertProps {
  type: "error" | "success" | "info";
  message: string;
}

const STYLES = {
  error: "border-red-500/30 bg-red-500/10 text-red-400",
  success: "border-[#1db954]/30 bg-[#1db954]/10 text-[#1db954]",
  info: "border-zinc-600 bg-zinc-800/50 text-zinc-300",
};

export function AuthAlert({ type, message }: AuthAlertProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${STYLES[type]}`}
    >
      {message}
    </div>
  );
}
