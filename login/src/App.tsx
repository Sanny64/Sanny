import { BrowserRouter, Route, Routes } from "react-router-dom";
import Main from "./pages/Main";
import AccountLinkingPage from "./pages/accountLinkingPage/AccountLinkingPage";
import AccountLinkingProofPage from "./pages/accountLinkingPage/AccountLinkingProofPage";

function App() {
  return (
    <BrowserRouter>
      {/* Main routes */}
      <Routes>
        <Route element={<Main />}>
          <Route path="/confirm-linking" element={<AccountLinkingPage />} />
          <Route
            path="/account-link-proof-complete"
            element={<AccountLinkingProofPage />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
