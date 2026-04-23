import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeProvider';
import { LanguageProvider } from './context/LanguageProvider';
import Structure from './areas/Structure';
import Home from './pages/home/Home';
import About from './pages/about/About';
import Portfolio from './pages/about/Portfolio';
import Projects from './pages/projects/Projects';
import Settings from './pages/settings/Settings'
import './styles/globals.css';
import './components/components.css';
import './pages/home/home.css';
import './pages/about/about.css';
import './pages/about/portfolio.css';
import './pages/projects/projects.css';
import './pages/settings/settings.css';

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Structure>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />         
            </Routes>
          </Structure>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;