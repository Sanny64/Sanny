import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Error, Settings } from '@sanny/ui';
import Main from './pages/Main';
import Home from './pages/home/Home';
import Portfolio from './pages/portfolio/Portfolio';
import Projects from './pages/projects/Projects';
import Haptigation from './pages/projects/haptigation/Haptigation';
import Proscrum from './pages/projects/proscrum/Proscrum';
import SAU from './pages/projects/sau/SAU';
import SEO from './pages/projects/seos/SEOS';
import SMNow from './pages/projects/smnow/SMNow';
import Blog from './pages/blog/Blog';
import Games from './pages/games/Games';
import Auxiliary from './pages/Auxiliary';
import Party from './pages/party/Party';
import Refreshing from './pages/party/refreshing/Refreshing';
import Comfort from './pages/party/comfort/Comfort';

function App() {
  return (
    <>
      {/* Routing */}
      <BrowserRouter>
        <Routes>
          {/* Main routes */}
          <Route element={<Main />}>
            <Route path="/" element={<Home />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/haptigation" element={<Haptigation />} />
            <Route path="/projects/proscrum" element={<Proscrum />} />
            <Route path="/projects/sau" element={<SAU />} />
            <Route path="/projects/seo" element={<SEO />} />
            <Route path="/projects/sm.now" element={<SMNow />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/games" element={<Games />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          {/* Auxiliary routes */}
          <Route element={<Auxiliary />}>
            <Route path="/party" element={<Party />} />
            <Route path="/party/refreshing" element={<Refreshing />} />
            <Route path="/party/comfort" element={<Comfort />} />
          </Route>
          {/* Redirect any unknown routes to Error */}
          <Route element={<Main />}>
            <Route path="*" element={<Error />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
