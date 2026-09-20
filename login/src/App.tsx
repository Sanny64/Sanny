import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Main from "./pages/Main";
import AccountLinkingPage from "./pages/accountLinkingPage/AccountLinkingPage";
import AccountLinkingProofPage from "./pages/accountLinkingPage/AccountLinkingProofPage";

const router = createBrowserRouter([
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
