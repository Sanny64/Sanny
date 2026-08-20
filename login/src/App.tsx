import { BrowserRouter, Route, Routes } from "react-router-dom";
import Main from "./pages/Main";
import LoginPage from "./pages/loginPage/LoginPage";

function App() {
  return (
    <BrowserRouter>
      {/* Main routes */}
      <Routes>
        <Route element={<Main />}>
          <Route path="/" element={<LoginPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
