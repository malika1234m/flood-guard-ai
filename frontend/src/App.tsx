import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { Predict } from "@/pages/Predict";
import { Dashboard } from "@/pages/Dashboard";
import { Impact } from "@/pages/Impact";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="predict" element={<Predict />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="impact" element={<Impact />} />
      </Route>
    </Routes>
  );
}
