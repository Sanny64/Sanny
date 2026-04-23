import { Link } from 'react-router-dom';
import { useLanguage } from '../../../hooks/useLanguage';

interface NavBarProps {
  onLinkClick?: () => void;
}

export default function NavBar({ onLinkClick }: NavBarProps) {
  const { t } = useLanguage();
  
  return (
    <nav aria-label={t.nav.main} className="main-navigation">
      <ul role="menubar">
        <li role="none" className="home-redirect">
          <Link 
            to="/" 
            role="navbaritem" 
            aria-label={t.nav.home_redirect}
            onClick={onLinkClick}
          >
            {t.nav.home}
          </Link>
        </li>
        <li role="none">
          <Link 
            to="/about" 
            role="navbaritem" 
            aria-label={t.nav.about_redirect}
            onClick={onLinkClick}
          >
            {t.nav.about}
          </Link>
        </li>
        <li role="none">
          <Link 
            to="/projects" 
            role="navbaritem" 
            aria-label={t.nav.projects_redirect}
            onClick={onLinkClick}
          >
            {t.nav.projects}
          </Link>
        </li>
        <li role="none">
          <a
            href="/stuff/wasd_minigame.html"
            role="navbaritem"
            aria-label={t.nav.minigame}
            onClick={onLinkClick}
          >
            {t.nav.adventure}
          </a>
          {/* <Link 
            to="https://adventure.sanny64.de" 
            role="navbaritem" 
            aria-label={t.nav.adventure_redirect}
            onClick={onLinkClick}
          >
            {t.nav.adventure}
          </Link> */}
        </li>
      </ul>
    </nav>
  );
}