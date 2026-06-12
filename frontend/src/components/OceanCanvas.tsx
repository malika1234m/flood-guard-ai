import { useEffect, useRef } from "react";

const COLORS = ["56,189,248", "99,102,241", "125,211,252"];

interface Particle {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  color: string;
}

interface Stream {
  baseY: number;
  amp: number;
  freq: number;
  speed: number;
  offset: number;
  color: string;
}

interface OceanCanvasProps {
  particles?: number;
  streams?: number;
  className?: string;
}

/** Drifting glow particles + flowing light streams behind hero sections. */
export function OceanCanvas({ particles = 0, streams = 0, className }: OceanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let rafId = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const particleList: Particle[] = Array.from({ length: particles }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random() * 2.5,
      speed: 0.01 + Math.random() * 0.025,
      phase: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    const streamList: Stream[] = Array.from({ length: streams }, (_, i) => ({
      baseY: 0.2 + (i / Math.max(streams, 1)) * 0.6 + Math.random() * 0.08,
      amp: 0.05 + Math.random() * 0.06,
      freq: 1.1 + Math.random() * 1.3,
      speed: 0.05 + Math.random() * 0.05,
      offset: Math.random() * Math.PI * 2,
      color: COLORS[i % COLORS.length],
    }));

    function drawStream(stream: Stream, t: number) {
      ctx!.beginPath();
      const segments = 28;
      for (let i = 0; i <= segments; i++) {
        const nx = i / segments;
        const px = nx * width;
        const py =
          (stream.baseY +
            Math.sin(nx * Math.PI * stream.freq + t * stream.speed + stream.offset) * stream.amp) *
          height;
        if (i === 0) ctx!.moveTo(px, py);
        else ctx!.lineTo(px, py);
      }
      const gradient = ctx!.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, `rgba(${stream.color}, 0)`);
      gradient.addColorStop(0.5, `rgba(${stream.color}, 0.35)`);
      gradient.addColorStop(1, `rgba(${stream.color}, 0)`);
      ctx!.strokeStyle = gradient;
      ctx!.lineWidth = 1.4;
      ctx!.shadowColor = `rgba(${stream.color}, 0.6)`;
      ctx!.shadowBlur = 8;
      ctx!.stroke();
      ctx!.shadowBlur = 0;
    }

    function drawParticle(p: Particle, t: number) {
      const x = ((p.x + Math.sin(t * 0.15 + p.phase) * 0.025 + 1) % 1) * width;
      const y = (1 - ((p.y + t * p.speed) % 1)) * height;
      const twinkle = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6 + p.phase));
      const r = p.r * (0.85 + 0.35 * twinkle) * 4;
      const gradient = ctx!.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${p.color}, ${0.5 * twinkle})`);
      gradient.addColorStop(1, `rgba(${p.color}, 0)`);
      ctx!.fillStyle = gradient;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    function render(t: number) {
      ctx!.clearRect(0, 0, width, height);
      streamList.forEach((s) => drawStream(s, t));
      particleList.forEach((p) => drawParticle(p, t));
    }

    function loop(time: number) {
      render(time / 1000);
      rafId = requestAnimationFrame(loop);
    }

    resize();
    render(0);

    if (!reduceMotion) {
      rafId = requestAnimationFrame(loop);
    }

    const handleResize = () => {
      resize();
      render(reduceMotion ? 0 : performance.now() / 1000);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [particles, streams]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ mixBlendMode: "screen" }}
    />
  );
}
