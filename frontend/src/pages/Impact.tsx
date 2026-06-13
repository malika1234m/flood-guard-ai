import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, X } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";

const GALLERY = [
  {
    src: "/ditwah/ditwah-05-aerial-town.avif",
    alt: "Aerial view of a Sri Lankan town almost entirely submerged by brown floodwater",
    caption: "An entire town swallowed by the swollen river after days of relentless rain.",
  },
  {
    src: "/ditwah/ditwah-08-landslide.jpeg",
    alt: "Aerial view of a landslide that destroyed homes and a road on a hillside",
    caption: "A landslide triggered by saturated hillsides tears through homes, roads, and vehicles.",
  },
  {
    src: "/ditwah/ditwah-01-apartments.jpeg",
    alt: "Riverside apartment blocks damaged and surrounded by mud after flooding",
    caption: "Riverside apartment blocks left buried in mud and debris after the floodwaters receded.",
  },
  {
    src: "/ditwah/ditwah-06-aerial-bridges.jpeg",
    alt: "Aerial view of a flooded river with bridges crossing brown floodwater",
    caption: "Bridges and roads nearly disappear under floodwater as the river bursts its banks, cutting off entire communities.",
  },
  {
    src: "/ditwah/ditwah-07-boat-rescue.jpeg",
    alt: "Rescue boat carrying people along a flooded city street",
    caption: "Rescue teams use boats to reach residents stranded along flooded city streets.",
  },
  {
    src: "/ditwah/ditwah-03-evacuation.jpeg",
    alt: "Families wading through flooded streets carrying belongings",
    caption: "Families wade through flooded streets carrying whatever belongings they could salvage.",
  },
  {
    src: "/ditwah/ditwah-04-raft-rescue.jpeg",
    alt: "A man ferries a child to safety on a makeshift raft through floodwater",
    caption: "A father ferries his daughter to safety on a makeshift raft. (Ishara S. Kodikara / AFP)",
  },
  {
    src: "/ditwah/ditwah-02-wading-home.webp",
    alt: "A resident wades through floodwater toward a damaged house with belongings piled outside",
    caption: "A resident wades through floodwater to reach what remains of his home.",
  },
];

export function Impact() {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div>
      <PageHero
        variant="cover"
        title="Cyclone Ditwah: the disaster behind the mission"
        description="In late 2025, Cyclone Ditwah brought days of torrential rain to Sri Lanka, swelling rivers, triggering landslides, and submerging entire towns. This is what early warning is for."
        image="/hero/flood-disaster-bridge.webp"
        imageAlt="Aerial view of a Sri Lankan coastal town submerged by floodwater at dusk, with a lit bridge crossing the water"
        overlay={
          <>
            <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_25%,rgba(239,68,68,0.16),transparent_70%)]" />
            <div className="absolute left-5 top-5 z-10 inline-flex items-center gap-2 rounded-full border border-[rgba(239,68,68,0.35)] bg-[#04101f]/45 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#fca5a5] backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-[#ef4444]" /> November 2025 · Severe flooding
            </div>
          </>
        }
      />

      {/* Context */}
      <section className="glass-panel relative mb-9 overflow-hidden rounded-[20px] p-7 sm:p-9">
        <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-[rgba(99,102,241,0.12)] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-[rgba(239,68,68,0.10)] blur-[100px]" />
        <div className="mx-auto max-w-[760px] space-y-4 leading-[1.75] text-muted-foreground">
          <p>
            Cyclone Ditwah tracked across the Bay of Bengal and made landfall over Sri Lanka, dumping days of
            torrential rainfall on the island's central, southern, and eastern provinces. Rivers that communities
            had lived beside for generations broke their banks within hours. Saturated hillsides gave way in
            landslides. Roads, bridges, and entire neighborhoods disappeared under brown floodwater, and families
            were forced to evacuate with whatever they could carry.
          </p>
          <p>
            The photographs below were taken during the disaster response — they're the reason this project exists.
            A flood-risk score that arrives minutes earlier, for the right location, can be the difference between
            a family evacuating in time and a family wading through what's left of their home. FloodGuard AI turns
            the geography, climate, and infrastructure data agencies already collect into that early warning.
          </p>
        </div>
      </section>

      {/* Video */}
      <section className="relative py-8">
        <SectionHeader
          eyebrow="Watch"
          title="Cyclone Ditwah's impact on Sri Lanka"
          description="Footage from the ground showing the scale of flooding across affected communities."
        />
        <div className="glass-panel mx-auto aspect-video max-w-[860px] overflow-hidden rounded-[20px]">
          <iframe
            className="h-full w-full"
            src="https://www.youtube-nocookie.com/embed/eX32jJNYAGE"
            title="Cyclone Ditwah's impact on Sri Lanka"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <p className="mt-3 text-center text-[0.8rem] text-muted-foreground">
          <a
            href="https://www.youtube.com/watch?v=eX32jJNYAGE"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-brand hover:underline"
          >
            Watch on YouTube <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
      </section>

      {/* Gallery */}
      <section className="relative py-8">
        <SectionHeader
          eyebrow="On the ground"
          title="What the floodwater left behind"
          description="Click any photo to view it full-size."
        />
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {GALLERY.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => setOpen(i)}
              className="group glass-panel overflow-hidden rounded-[20px] text-left transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_rgba(56,189,248,0.18)]"
            >
              <div className="h-52 w-full overflow-hidden">
                <img
                  src={img.src}
                  alt={img.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <p className="p-4 text-[0.88rem] leading-[1.6] text-muted-foreground">{img.caption}</p>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-[0.8rem] text-muted-foreground">
          Photographs sourced from public news coverage of Cyclone Ditwah's impact on Sri Lanka. Used here for
          educational, non-commercial context.
        </p>
      </section>

      {/* Lightbox */}
      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={GALLERY[open].caption}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground transition-colors hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
          <figure className="max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={GALLERY[open].src}
              alt={GALLERY[open].alt}
              className="max-h-[75vh] max-w-full rounded-[14px] object-contain"
            />
            <figcaption className="mx-auto mt-3 max-w-[640px] text-center text-sm text-muted-foreground">
              {GALLERY[open].caption}
            </figcaption>
          </figure>
        </div>
      )}

      {/* CTA */}
      <section
        className="glass-panel relative mb-2 mt-9 overflow-hidden rounded-[20px] px-6 py-14 text-center"
        style={{
          background:
            "radial-gradient(60% 90% at 50% 100%, rgba(239,68,68,0.18), transparent 70%), radial-gradient(50% 70% at 50% 0%, rgba(99,102,241,0.16), transparent 70%), rgba(255,255,255,0.025)",
        }}
      >
        <h2 className="mb-3 text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-0.02em]">
          From disaster response to disaster prevention
        </h2>
        <p className="mx-auto mb-6.5 max-w-[520px] leading-[1.6] text-muted-foreground">
          Run a real assessment to see how FloodGuard AI scores flood risk for a location — and what an early
          warning could have looked like.
        </p>
        <Button asChild variant="gradient" size="xl">
          <Link to="/predict">Assess a location</Link>
        </Button>
      </section>
    </div>
  );
}
