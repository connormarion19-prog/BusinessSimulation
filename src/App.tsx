import { HashRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import MainMenu from "./pages/MainMenu";
import NewGame from "./pages/NewGame";
import Dashboard from "./pages/Dashboard";
import Finance from "./pages/Finance";
import Operations from "./pages/Operations";
import Products from "./pages/Products";
import Employees from "./pages/Employees";
import Hiring from "./pages/Hiring";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Competitors from "./pages/Competitors";
import Market from "./pages/Market";
import Reports from "./pages/Reports";
import CompanyPage from "./pages/Company";
import Settings from "./pages/Settings";
import Debug from "./pages/Debug";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/new" element={<NewGame />} />
        <Route path="/game" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="finance" element={<Finance />} />
          <Route path="operations" element={<Operations />} />
          <Route path="products" element={<Products />} />
          <Route path="employees" element={<Employees />} />
          <Route path="hiring" element={<Hiring />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="competitors" element={<Competitors />} />
          <Route path="market" element={<Market />} />
          <Route path="reports" element={<Reports />} />
          <Route path="company" element={<CompanyPage />} />
          <Route path="debug" element={<Debug />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
