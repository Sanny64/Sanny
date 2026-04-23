import { useLanguage } from '../../../hooks/useLanguage';
import Picture from '../../../components/picture';

type LogoProps = {
  onClick?: () => void;
};

export default function Logo({ onClick }: LogoProps) {
  const { t } = useLanguage();

  return (
    <div className="logo-container" aria-label="Logo Container">
      <Picture
        href="/home"
        role="menuitem"
        ariaLabel={t.nav.home_redirect}
        onClick={onClick}
        src="/favicon.ico"
        alt="Website Logo"
        width={64}
        height={64}
        className="logo-link"
        imageClassName="logo"
      />
    </div>
  );
}