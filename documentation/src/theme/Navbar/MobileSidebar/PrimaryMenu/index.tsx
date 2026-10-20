import React, { type ReactNode } from "react";
import { useLayoutDocsSidebar } from "@docusaurus/plugin-content-docs/client";
import { useLocation } from "@docusaurus/router";
import { useThemeConfig } from "@docusaurus/theme-common";
import { useNavbarMobileSidebar } from "@docusaurus/theme-common/internal";
import NavbarItem, { type Props as NavbarItemConfig } from "@theme/NavbarItem";
import { mobileSidebarOpenPathKey } from "../mobileSidebarState";

type DocSidebarItemConfig = Extract<NavbarItemConfig, { type: "docSidebar" }>;

function useNavbarItems() {
  return useThemeConfig().navbar.items as NavbarItemConfig[];
}

function MobileDocSidebarItem({
  item,
}: {
  item: DocSidebarItemConfig;
}): ReactNode {
  const sidebarLink = useLayoutDocsSidebar(
    item.sidebarId,
    item.docsPluginId,
  ).link;
  const { pathname } = useLocation();
  const mobileSidebar = useNavbarMobileSidebar();

  return (
    <NavbarItem
      mobile
      {...item}
      onClick={() => {
        if (sidebarLink) {
          try {
            window.sessionStorage.setItem(
              mobileSidebarOpenPathKey,
              sidebarLink.path,
            );
          } catch {
            return;
          }

          if (pathname === sidebarLink.path) {
            mobileSidebar.toggle();
          }
        }
      }}
    />
  );
}

export default function NavbarMobilePrimaryMenu(): ReactNode {
  const mobileSidebar = useNavbarMobileSidebar();
  const items = useNavbarItems();

  return (
    <ul className="menu__list">
      {items.map((item, index) =>
        item.type === "docSidebar" ? (
          <MobileDocSidebarItem item={item} key={index} />
        ) : (
          <NavbarItem
            mobile
            {...item}
            onClick={() => mobileSidebar.toggle()}
            key={index}
          />
        ),
      )}
    </ul>
  );
}
