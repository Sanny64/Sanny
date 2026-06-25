import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Main from './pages/Main'
import LoginPage from './pages/loginPage/LoginPage'
import { Error } from '@sanny/ui';

function App() {
  return (
    <BrowserRouter>
      {/* Main routes */}
      <Routes>
        <Route element={<Main />}>
          <Route path="/" element={<LoginPage />} />
          <Route path="*" element={<Error />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
