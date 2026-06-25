import { Outlet, useLocation } from 'react-router-dom';
import '@sanny/styles/globals.css';
import '@sanny/styles/auxiliary.css';
import '../styles/party.css';
import '../styles/refreshing.css';
import '../styles/comfort.css';

export default function Layout() {
  const { pathname } = useLocation();

  function getRouteClass() {
    switch (pathname) {
      case '/party':
        return 'auxiliary-layout--party';
      case '/party/refreshing':
        return 'auxiliary-layout--refreshing';
      case '/party/comfort':
        return 'auxiliary-layout--comfort';
      default:
        try {
          console.error('Unknown route:', pathname);
          return '';
        } catch (e) {
          console.error('Error occurred while determining route class:', e);
          return '';
        }
    }
  }

  const routeClass = getRouteClass();

  return (
    <div className={`auxiliary-layout ${routeClass}`}>
      <Outlet />
    </div>
  );
}
