import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  return (
    <span className="inline-flex gap-1 text-[1.3rem] leading-none">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
          className={cn(
            "cursor-pointer transition-colors disabled:cursor-default",
            star <= value ? "text-risk-moderate" : "text-[#3b4a66] hover:text-muted-foreground",
          )}
        >
          ★
        </button>
      ))}
    </span>
  );
}
