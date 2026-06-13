export function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto mb-11 max-w-[620px] text-center">
      <div className="mb-2.5 text-[0.78rem] font-bold uppercase tracking-[0.12em] text-brand">{eyebrow}</div>
      <h2 className="mb-3 text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-[-0.02em]">{title}</h2>
      <p className="leading-[1.6] text-muted-foreground">{description}</p>
    </div>
  );
}
