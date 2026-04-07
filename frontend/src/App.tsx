import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { TableProvider } from "./contexts/TableContext";
import Klijent from "./pages/Klijent";
import Grupa from "./pages/Grupa";
import Sesija from "./pages/Sesija";
import Sesijaklijent from "./pages/Sesijaklijent";
import Sesijagrupa from "./pages/Sesijagrupa";
import Cena from "./pages/Cena";

function App() {
  return (
    <TableProvider>
      <div className="app-container">
        <main className="app-main">
          <Routes>
            <Route path="/klijent" element={<Klijent />} />
            <Route path="/grupa" element={<Grupa />} />
            <Route path="/sesija" element={<Sesija />} />
            <Route path="/sesijaklijent" element={<Sesijaklijent />} />
            <Route path="/sesijagrupa" element={<Sesijagrupa />} />
            <Route path="/cena" element={<Cena />} />
            <Route path="/" element={<Navigate to="/klijent" replace />} />
            <Route path="*" element={<Navigate to="/klijent" replace />} />
          </Routes>
        </main>
      </div>
    </TableProvider>
  );
}
export default App;
