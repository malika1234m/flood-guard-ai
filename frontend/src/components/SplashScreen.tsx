import { useEffect, useRef, useState } from "react";

const PHASES = [
  "INITIALIZING RISK ENGINE...",
  "LOADING DISTRICT PROFILES...",
  "CALIBRATING ML MODELS...",
  "SYSTEM READY.",
];

interface Props {
  onDone: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  wrapped: boolean;
}

export function SplashScreen({ onDone }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);
  const [fading, setFading] = useState(false);
  const progressRaf = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRaf = useRef<number>(0);

  // ── Progress bar ────────────────────────────────────────────────────────────
  useEffect(() => {
    const start = performance.now();
    const FILL_DURATION = 2600;

    const tick = (now: number) => {
      const elapsed = now - start;
      const raw = Math.min(elapsed / FILL_DURATION, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      const pct = Math.round(eased * 100);
      setProgress(pct);
      if (pct < 28) setPhase(0);
      else if (pct < 58) setPhase(1);
      else if (pct < 86) setPhase(2);
      else setPhase(3);

      if (raw < 1) {
        progressRaf.current = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          setFading(true);
          setTimeout(onDone, 520);
        }, 400);
      }
    };
    progressRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(progressRaf.current);
  }, [onDone]);

  // ── Flow field particle animation ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;
    const NUM = 320;
    const TRAIL = 0.13; // how quickly old trails fade (lower = longer trails)
    const SCALE = 0.0018;
    const SPEED = 1.4;

    // colour palette: sky-blue, indigo, teal — all at low saturation so they glow not clash
    const COLORS = [
      "56,189,248",  // brand blue  ~70% of particles
      "56,189,248",
      "56,189,248",
      "99,102,241",  // indigo
      "34,211,238",  // teal
    ];

    const particles: Particle[] = Array.from({ length: NUM }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
      size: 0.6 + Math.random() * 1.0,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 0.4 + Math.random() * 0.5,
      wrapped: false,
    }));

    let t = 0;

    // vector field: layered sines create organic swirling "water current" look
    const fieldAngle = (x: number, y: number, time: number): number => {
      const nx = x * SCALE;
      const ny = y * SCALE;
      return (
        Math.sin(nx + time * 0.35) * Math.cos(ny + time * 0.25) * Math.PI * 2 +
        Math.sin((nx - ny) * 0.8 + time * 0.18) * Math.PI +
        Math.cos((nx + ny) * 0.5 + time * 0.12) * Math.PI * 0.5
      );
    };

    const draw = () => {
      // Subtle fade — keeps trails without full clear
      ctx.fillStyle = `rgba(7,16,30,${TRAIL})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      t += 0.004;

      for (const p of particles) {
        const angle = fieldAngle(p.x, p.y, t);
        p.vx = p.vx * 0.92 + Math.cos(angle) * SPEED * 0.08;
        p.vy = p.vy * 0.92 + Math.sin(angle) * SPEED * 0.08;

        const prevX = p.x;
        const prevY = p.y;
        p.x += p.vx * SPEED;
        p.y += p.vy * SPEED;

        // wrap edges — flag so we skip drawing the cross-screen trail
        p.wrapped = false;
        if (p.x < 0) { p.x = canvas.width; p.wrapped = true; }
        else if (p.x > canvas.width) { p.x = 0; p.wrapped = true; }
        if (p.y < 0) { p.y = canvas.height; p.wrapped = true; }
        else if (p.y > canvas.height) { p.y = 0; p.wrapped = true; }

        // draw trail segment only when no wrap occurred this frame
        if (!p.wrapped) {
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(${p.color},${p.alpha})`;
          ctx.lineWidth = p.size;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // bright head dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${Math.min(p.alpha + 0.25, 1)})`;
        ctx.fill();
      }

      animRaf.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRaf.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      aria-label="Loading FloodGuard AI"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden"
      style={{
        background: "#07101e",
        opacity: fading ? 0 : 1,
        transition: "opacity 520ms cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {/* Flow field canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 0 }}
      />

      {/* Centre vignette so UI text stays readable over the particles */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(7,16,30,0.82) 0%, rgba(7,16,30,0.45) 55%, transparent 100%)",
        }}
      />

      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          zIndex: 1,
          width: 460,
          height: 460,
          background:
            "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.10) 0%, rgba(99,102,241,0.06) 50%, transparent 72%)",
        }}
      />

      {/* Logo */}
      <img
        src="/logo/floodguard-icon-64.png"
        alt="FloodGuard AI logo"
        className="relative mb-7"
        style={{
          zIndex: 2,
          height: 80,
          width: 80,
          objectFit: "contain",
          filter:
            "drop-shadow(0 0 24px rgba(56,189,248,0.60)) drop-shadow(0 0 8px rgba(56,189,248,0.40))",
        }}
      />

      {/* Brand name */}
      <h1
        className="relative mb-1.5 font-serif font-semibold uppercase"
        style={{
          zIndex: 2,
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(2rem, 5vw, 3rem)",
          letterSpacing: "0.2em",
          color: "#e6edf6",
          textShadow: "0 0 40px rgba(56,189,248,0.22)",
        }}
      >
        FloodGuard
        <span style={{ color: "#38bdf8", marginLeft: "0.15em" }}>AI</span>
      </h1>

      {/* Sub-label */}
      <p
        className="relative mb-12 font-sans font-semibold uppercase"
        style={{
          zIndex: 2,
          fontSize: "0.68rem",
          color: "rgba(147,164,191,0.75)",
          letterSpacing: "0.28em",
        }}
      >
        Flood Intelligence System
      </p>

      {/* Progress bar */}
      <div className="relative w-[min(340px,72vw)]" style={{ zIndex: 2 }}>
        <div className="mb-2 flex items-center gap-3">
          <div
            className="h-px flex-1 overflow-hidden rounded-full"
            style={{ background: "rgba(56,189,248,0.12)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #38bdf8, #6366f1)",
                boxShadow: "0 0 10px rgba(56,189,248,0.55)",
                transition: "width 60ms linear",
              }}
            />
          </div>
          <span
            className="font-sans tabular-nums"
            style={{
              fontSize: "0.72rem",
              color: "rgba(56,189,248,0.85)",
              minWidth: "3.2ch",
              letterSpacing: "0.04em",
            }}
          >
            {progress}%
          </span>
        </div>

        {/* Status message */}
        <p
          className="text-center font-sans font-semibold uppercase"
          style={{
            fontSize: "0.64rem",
            color: "rgba(147,164,191,0.65)",
            letterSpacing: "0.14em",
            minHeight: "1em",
          }}
        >
          {PHASES[phase]}
        </p>
      </div>

      {/* Phase dots */}
      <div className="relative mt-8 flex items-center gap-3" style={{ zIndex: 2 }}>
        {PHASES.map((_, i) => (
          <span
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i <= phase ? 20 : 6,
              height: 4,
              background: i <= phase ? "#38bdf8" : "rgba(56,189,248,0.18)",
              boxShadow: i <= phase ? "0 0 6px rgba(56,189,248,0.55)" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
