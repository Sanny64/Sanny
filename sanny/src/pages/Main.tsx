import { Outlet } from "react-router-dom";
import { AppShell } from "@sanny/ui";
import Menu from "../components/advanced/Menu";

export default function Layout() {
  return (
    <AppShell headerActions={<Menu />}>
      <Outlet />
    </AppShell>
  );
}
