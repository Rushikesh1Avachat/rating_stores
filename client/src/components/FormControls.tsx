import { useRef, type ReactNode } from "react";
import { Star } from "lucide-react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

export function StarPicker({ value, onChange, large = false }: {
  value: number;
  onChange: (value: number) => void;
  large?: boolean;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div className={`star-picker ${large ? "star-picker-large" : ""}`} role="radiogroup" aria-label="Choose a rating">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          ref={(element) => { buttons.current[score - 1] = element; }}
          type="button"
          role="radio"
          aria-checked={value === score}
          tabIndex={value === score || (value === 0 && score === 1) ? 0 : -1}
          aria-label={`${score} ${score === 1 ? "star" : "stars"}`}
          className={score <= value ? "star-selected" : ""}
          onClick={() => onChange(score)}
          onKeyDown={(event) => {
            const directions: Record<string, number> = {
              ArrowRight: 1,
              ArrowDown: 1,
              ArrowLeft: -1,
              ArrowUp: -1,
            };
            const direction = directions[event.key];
            const nextScore = direction
              ? ((score - 1 + direction + 5) % 5) + 1
              : event.key === "Home" ? 1 : event.key === "End" ? 5 : null;
            if (nextScore === null) return;
            event.preventDefault();
            onChange(nextScore);
            buttons.current[nextScore - 1]?.focus();
          }}
        >
          <Star size={large ? 34 : 18} fill={score <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}
