import { Outlet, useLocation } from 'react-router-dom';
import '@sanny/styles/globals.css';
import '@sanny/styles/auxiliary.css';
import '../css/pages/party.css';
import '../css/pages/refreshments.css';
import '../css/pages/comfort.css';

export default function Layout() {
  const { pathname } = useLocation();

  function mapRouteToCSS() {
    switch (pathname) {
      case '/party':
        return 'auxiliary-layout--party';
      case '/party/refreshments':
        return 'auxiliary-layout--refreshments';
      case '/party/comfort':
        return 'auxiliary-layout--comfort';
      default:
        try {
          console.error('Unknown route:', pathname);
          return '';
        } catch (e) {
          console.error('Error occurred while determining route CSS:', e);
          return '';
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
