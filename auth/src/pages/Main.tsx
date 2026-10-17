import { Outlet } from "react-router-dom";
import { AppShell } from "@sanny/ui";

export default function Layout() {
  return (
    <AppShell variant="auth">
      <Outlet />
    </AppShell>
  );
}
