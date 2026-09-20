import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import AccountSettings from "./pages/settings/AccountSettings";
import AdminSettings from "./pages/settings/AdminSettings";
import Main from "./pages/Main";
import Home from "./pages/home/Home";
import Portfolio from "./pages/portfolio/Portfolio";
import Projects from "./pages/projects/Projects";
import Haptigation from "./pages/projects/haptigation/Haptigation";
import Proscrum from "./pages/projects/proscrum/Proscrum";
import SAU from "./pages/projects/sau/SAU";
import SEO from "./pages/projects/seos/SEOS";
import SMNow from "./pages/projects/smnow/SMNow";
import Blog from "./pages/blog/Blog";
import Games from "./pages/games/Games";
import Auxiliary from "./pages/Auxiliary";
import Party from "./pages/party/Party";
import Refreshments from "./pages/party/refreshments/Refreshments";
import Comfort from "./pages/party/comfort/Comfort";

const router = createBrowserRouter([
  {
    // Main routes using the <Main /> Layout
    element: <Main />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/home", element: <Navigate to="/" replace /> },
      { path: "/portfolio", element: <Portfolio /> },
      { path: "/projects", element: <Projects /> },
      { path: "/projects/haptigation", element: <Haptigation /> },
      { path: "/projects/proscrum", element: <Proscrum /> },
      { path: "/projects/sau", element: <SAU /> },
      { path: "/projects/seo", element: <SEO /> },
      { path: "/projects/sm.now", element: <SMNow /> },
      { path: "/blog", element: <Blog /> },
      { path: "/games", element: <Games /> },
      { path: "/settings", element: <AccountSettings /> },
      { path: "/admin/settings", element: <AdminSettings /> },
    ],
  },
  {
    // Auxiliary routes using the <Auxiliary /> Layout
    element: <Auxiliary />,
    children: [
      { path: "/party", element: <Party /> },
      { path: "/party/refreshments", element: <Refreshments /> },
      { path: "/party/comfort", element: <Comfort /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
