import { useState } from "react";
import CivilLoginPage from "./CivilLoginPage";
import CivilDashboard from "./CivilDashboard";

export default function CivilApp({ onBack }) {
  const [civilUser, setCivilUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ts_civil_user") || "null"); }
    catch { return null; }
  });

  if (!civilUser) return (
    <CivilLoginPage
      onLogin={user => setCivilUser(user)}
      onBack={onBack}
    />
  );

  return (
    <CivilDashboard
      civilUser={civilUser}
      onLogout={() => {
        localStorage.removeItem("ts_civil_user");
        setCivilUser(null);
      }}
    />
  );
}
