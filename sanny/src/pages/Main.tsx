import { Outlet } from "react-router-dom";
import "@sanny/styles/globals.css";
import "@sanny/styles/main.css";
import LoginButton from "../components/default/LoginButton";

export default function Layout() {
  return (
    <>
      <div className="layout">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <main id="main-content" className="main-content">
          <LoginButton />
          <Outlet />
        </main>
      </div>
    </>
  );
}
