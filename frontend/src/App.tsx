import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { District } from "@/pages/District";
import { Predict } from "@/pages/Predict";
import { Forecast } from "@/pages/Forecast";
import { Priority } from "@/pages/Priority";
import { Dashboard } from "@/pages/Dashboard";
import { Impact } from "@/pages/Impact";
import { PipelineLab } from "@/pages/PipelineLab";
import { Alerts } from "@/pages/Alerts";
import { SplashScreen } from "@/components/SplashScreen";

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <Routes>
        {/* Hidden diagnostic page — no nav wrapper, no splash */}
        <Route path="pipeline-lab" element={<PipelineLab />} />

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="district" element={<District />} />
          <Route path="predict" element={<Predict />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="priority" element={<Priority />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="impact" element={<Impact />} />
          <Route path="alerts" element={<Alerts />} />
        </Route>
      </Routes>
    </>
  );
}
