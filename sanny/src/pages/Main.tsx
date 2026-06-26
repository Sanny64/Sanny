import { Outlet } from "react-router-dom";
import "@sanny/styles/globals.css";
import "@sanny/styles/main.css";

export default function Layout() {
  return (
    <>
      <div className="layout">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <main id="main-content" className="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
