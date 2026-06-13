import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeroProps {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  image?: string;
  imageAlt?: string;
  /** Decorative HUD elements positioned over the background image (e.g. floating status badges). */
  overlay?: ReactNode;
  /**
   * "side" (default): text-left, image fades in on the right, animated scan-line.
   * "cover": full-bleed dim background image with the title/description anchored to the bottom.
   */
  variant?: "side" | "cover";
}

export function PageHero({ title, description, action, image, imageAlt, overlay, variant = "side" }: PageHeroProps) {
  const isCover = variant === "cover";

  return (
    <section
      className={cn(
        "hero-aurora-page relative mb-5.5 flex flex-col overflow-hidden rounded-[20px]",
        image && !isCover && "lg:min-h-[300px] lg:justify-center",
        image && isCover && "min-h-[280px] justify-end lg:min-h-[420px]",
      )}
    >
      {image && (
        <>
          <img
            src={image}
            alt={imageAlt ?? ""}
            className={cn("absolute inset-0 h-full w-full object-cover", isCover ? "opacity-55" : "opacity-50")}
            loading="lazy"
          />
          <div
            className={cn(
              "absolute inset-0",
              isCover
                ? "bg-gradient-to-t from-background via-background/65 to-background/15"
                : "bg-gradient-to-r from-background via-background/65 to-background/10",
            )}
          />
          {!isCover && <div className="hero-scan-line" />}
          {overlay}
        </>
      )}
      <div className={cn("relative z-2 px-7 py-10 sm:px-9", !isCover && "lg:max-w-[600px] lg:py-12")}>
        <h1 className="mb-2 text-[2rem] font-extrabold tracking-[-0.02em]">{title}</h1>
        <p className="max-w-[720px] leading-[1.6] text-muted-foreground">{description}</p>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </section>
  );
}
