import { Outlet } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { OceanCanvas } from "@/components/OceanCanvas";
import { Toaster } from "@/components/ui/sonner";

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <OceanCanvas particles={46} streams={3} className="pointer-events-none fixed inset-0 -z-10 block h-full w-full" />
      <Header />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pt-7 pb-15">
        <Outlet />
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
