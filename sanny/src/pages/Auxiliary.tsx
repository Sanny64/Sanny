import { Outlet, useLocation } from "react-router-dom";
import "@sanny/styles/globals.css";
import "@sanny/styles/auxiliary.css";
import "../styles/party.css";
import "../styles/refreshments.css";
import "../styles/comfort.css";

export default function Layout() {
  const { pathname } = useLocation();

  function mapRouteToCSS() {
    switch (pathname) {
      case "/party":
        return "auxiliary-layout--party";
      case "/party/refreshments":
        return "auxiliary-layout--refreshments";
      case "/party/comfort":
        return "auxiliary-layout--comfort";
      default:
        try {
          console.error("Unknown route:", pathname);
          return "";
        } catch (e) {
          console.error("Error occurred while determining route CSS:", e);
          return "";
        }
    }
  }

  const CSSRoute = mapRouteToCSS();

  return (
    <div className={`auxiliary-layout ${CSSRoute}`}>
      <Outlet />
    </div>
  );
}
