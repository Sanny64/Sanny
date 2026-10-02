import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Main from "./pages/Main";
import AccountLinkingPage from "./pages/accountLinkingPage/AccountLinkingPage";
import AccountLinkingProofPage from "./pages/accountLinkingPage/AccountLinkingProofPage";
import AccountLinkingResumePage from "./pages/accountLinkingPage/AccountLinkingResumePage";
import { prepareProofResume } from "./pages/accountLinkingPage/proof-resume";

const apiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_API_URL
  : import.meta.env.VITE_PROD_API_URL;

const router = createBrowserRouter([
  {
    path: "/account-link-proof-resume",
    element: <AccountLinkingResumePage />,
    loader: () =>
      prepareProofResume(apiUrl, window.location.hash, () => sessionStorage),
  },
  {
    element: <Main />,
    children: [
      {
        path: "/confirm-linking",
        element: <AccountLinkingPage />,
      },
      {
        path: "/account-link-proof-complete",
        element: <AccountLinkingProofPage />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
