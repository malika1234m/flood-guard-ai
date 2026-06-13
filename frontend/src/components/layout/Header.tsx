import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/predict", label: "Predict" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/impact", label: "Impact" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-y-2 border-b border-border bg-background/70 px-4 py-3.5 backdrop-blur-md sm:px-8 sm:py-4">
      <NavLink to="/" className="flex items-center gap-2 whitespace-nowrap text-base font-extrabold tracking-tight text-foreground sm:gap-2.5 sm:text-lg">
        <img src="/logo/floodguard-icon-64.png" alt="" className="h-7.5 w-7.5 shrink-0 sm:h-8.5 sm:w-8.5" />
        FloodGuard AI
      </NavLink>
      <nav className="flex w-full items-center justify-between gap-3.5 sm:w-auto sm:justify-start sm:gap-7">
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
