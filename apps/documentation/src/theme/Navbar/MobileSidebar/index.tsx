import React, { useEffect, type ReactNode } from 'react';
import { useLocation } from '@docusaurus/router';
import {
  useLockBodyScroll,
  useNavbarMobileSidebar,
} from '@docusaurus/theme-common/internal';
import NavbarMobileSidebarLayout from '@theme/Navbar/MobileSidebar/Layout';
import NavbarMobileSidebarHeader from '@theme/Navbar/MobileSidebar/Header';
import NavbarMobileSidebarPrimaryMenu from '@theme/Navbar/MobileSidebar/PrimaryMenu';
import NavbarMobileSidebarSecondaryMenu from '@theme/Navbar/MobileSidebar/SecondaryMenu';
import { mobileSidebarOpenPathKey } from './mobileSidebarState';

export default function NavbarMobileSidebar(): ReactNode {
  const mobileSidebar = useNavbarMobileSidebar();
  const { pathname } = useLocation();
  useLockBodyScroll(mobileSidebar.shown);

  useEffect(() => {
    try {
      const targetPath = window.sessionStorage.getItem(
        mobileSidebarOpenPathKey
      );
      window.sessionStorage.removeItem(mobileSidebarOpenPathKey);

      if (targetPath === pathname && !mobileSidebar.shown) {
        mobileSidebar.toggle();
      }
    } catch {
      return;
    }
  }, [mobileSidebar, pathname]);

  if (!mobileSidebar.shouldRender) {
    return null;
  }

  return (
    <NavbarMobileSidebarLayout
      header={<NavbarMobileSidebarHeader />}
      primaryMenu={<NavbarMobileSidebarPrimaryMenu />}
      secondaryMenu={<NavbarMobileSidebarSecondaryMenu />}
    />
  );
}
