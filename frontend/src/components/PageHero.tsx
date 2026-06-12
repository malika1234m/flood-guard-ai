import type { ReactNode } from "react";

interface PageHeroProps {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export function PageHero({ title, description, action }: PageHeroProps) {
  return (
    <section className="hero-aurora-page relative mb-5.5 overflow-hidden rounded-[20px]">
      <div className="relative z-2 px-7 py-10 sm:px-9">
        <h1 className="mb-2 text-[2rem] font-extrabold tracking-[-0.02em]">{title}</h1>
        <p className="max-w-[720px] leading-[1.6] text-muted-foreground">{description}</p>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </section>
  );
}
