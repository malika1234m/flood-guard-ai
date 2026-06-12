import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/predict", label: "Predict" },
  { to: "/dashboard", label: "Dashboard" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/70 px-4 py-3.5 backdrop-blur-md sm:px-8 sm:py-4">
      <NavLink to="/" className="flex items-center gap-2 whitespace-nowrap text-base font-extrabold tracking-tight text-foreground sm:gap-2.5 sm:text-lg">
        <svg className="h-6.5 w-6.5 shrink-0 sm:h-7.5 sm:w-7.5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="brandGrad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" />
              <stop offset="1" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <path
            d="M16 2.5 27.5 7.2v7.6c0 8-5 13.6-11.5 16.2C9 28.4 4.5 22.8 4.5 14.8V7.2z"
            fill="url(#brandGrad)"
            opacity="0.16"
            stroke="url(#brandGrad)"
            strokeWidth="1.4"
          />
          <path d="M16 9.5c2.9 3.6 4.8 6.3 4.8 8.7a4.8 4.8 0 1 1-9.6 0c0-2.4 1.9-5.1 4.8-8.7z" fill="url(#brandGrad)" />
        </svg>
        FloodGuard AI
      </NavLink>
      <nav className="flex items-center gap-3.5 sm:gap-7">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                "group relative py-1.5 text-[0.8rem] font-semibold transition-colors sm:text-sm",
                isActive ? "text-brand" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {item.label}
                <span
                  className={cn(
                    "absolute -bottom-0.5 left-0 h-0.5 rounded-full bg-gradient-to-r from-brand to-brand-2 transition-all duration-250",
                    isActive ? "right-0" : "right-full group-hover:right-0",
                  )}
                />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
