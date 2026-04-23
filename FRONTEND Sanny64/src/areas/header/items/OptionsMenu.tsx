import { useState, useRef, useEffect } from 'react';
import { MoreVertical, LogInIcon, LucideSettings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../hooks/useLanguage';
import Button from '../../../components/button';

export default function OptionsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLoginClick = () => {
    window.location.href = "https://auth.sanny64.de"
    setIsOpen(false);
  };

  const handleOptionsClick = () => {
    navigate("/settings");
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="options" aria-label={t.options.menu}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t.options.title}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="options-trigger"
        icon={<MoreVertical className="options-icon" aria-label={t.options.icon} role="image"/>}
      />
      
      {isOpen && (
        <div className="options-menu" role="menu" aria-label={t.options.title}>
          
          {/* <div className="options-section">
            <Button
              onClick={handleLoginClick}
              role="menuitem"
              aria-label={t.options.login_redirect}
              className="option-button"
              icon={<LogInIcon className='option-icon'/>}
              description="Login"
              descriptionClassName="option-description"
            />
          </div> */}

          <div className="options-section">
            <Button
              onClick={handleOptionsClick}
              role="menuitem"
              aria-label={t.options.settings_redirect}
              className="option-button"
              icon={<LucideSettings className='option-icon'/>}
              description={t.options.settings}
              descriptionClassName="option-description"
            />
          </div>
          
        </div>
      )}
    </div>
  );
}