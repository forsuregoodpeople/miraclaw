"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  BoxIcon,
  BoltIcon,
  ChevronDownIcon,
  DocsIcon,
  FolderIcon,
  GridIcon,
  GroupIcon,
  HorizontaLDots,
  ListIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  TaskIcon,
  UserCircleIcon,
  UserIcon,
} from "../icons/index";
import { FiRadio, FiGitMerge } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "superadmin" | "mitra" | "admin" | "teknisi";

type SubItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
  roles?: Role[]; // undefined = visible to all
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: SubItem[];
  roles?: Role[]; // undefined = visible to all
};

type NavGroup = {
  label: string;
  key: "main" | "others";
  items: NavItem[];
  roles?: Role[];
};

// ─── Navigation config ────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Menu",
    key: "main",
    items: [
      {
        icon: <DocsIcon />,
        name: "Panduan Setup",
        path: "/panduan",
      },
      {
        icon: <GridIcon />,
        name: "Dashboard",
        path: "/dashboard",
      },
      {
        icon: <GroupIcon />,
        name: "Pelanggan",
        subItems: [
          { name: "Paket",      path: "/packages",          icon: <BoxIcon />,         roles: ["superadmin", "mitra", "admin"] },
          { name: "Pelanggan",  path: "/mikrotik/pelanggan", icon: <UserCircleIcon /> },
        ],
      },
      {
        icon: <span className="flex h-5 w-5 items-center justify-center text-xs font-bold">Rp</span>,
        name: "Keuangan",
        roles: ["superadmin", "mitra", "admin"],
        subItems: [
          { name: "Pembayaran", path: "/finance/loket",   icon: <TaskIcon /> },
          { name: "Tagihan",    path: "/finance/tagihan", icon: <DocsIcon /> },
        ],
      },
      {
        icon: <TaskIcon />,
        name: "Tiket",
        subItems: [
          { name: "Daftar Tiket", path: "/tickets",        icon: <ListIcon /> },
          { name: "Buat Tiket",   path: "/tickets/create", icon: <DocsIcon /> },
        ],
      },
      {
        icon: <BoxCubeIcon />,
        name: "Mikrotik",
        roles: ["superadmin", "mitra", "admin", "teknisi"],
        subItems: [
          { name: "Perangkat", path: "/mikrotik",           icon: <BoxIcon />,    roles: ["superadmin", "mitra", "admin"] },
          { name: "Interface", path: "/mikrotik/interface", icon: <PlugInIcon /> },
          { name: "PPPoE",     path: "/mikrotik/pppoe",     icon: <BoltIcon /> },
          { name: "DHCP",      path: "/mikrotik/dhcp",      icon: <FolderIcon /> },
          { name: "Static",    path: "/mikrotik/static",    icon: <DocsIcon /> },
        ],
      },
      {
        icon: <PieChartIcon />,
        name: "Jaringan Optik",
        roles: ["superadmin", "mitra", "admin"],
        subItems: [
          { name: "GenieACS",    path: "/optical/genieacs", icon: <FiRadio className="w-4 h-4" /> },
          { name: "ODP",         path: "/optical/odp",      icon: <FiGitMerge className="w-4 h-4" /> },
          { name: "Peta Jaringan", path: "/map",            icon: <GridIcon /> },
          { name: "Alerts",      path: "/optical/alerts",   icon: <BoltIcon /> },
        ],
      },
    ],
  },
  {
    label: "Manajemen",
    key: "others",
    items: [
      {
        icon: <UserCircleIcon />,
        name: "Pengguna",
        roles: ["superadmin", "mitra", "admin"],
        subItems: [
          { name: "Daftar Pengguna", path: "/users",       icon: <GroupIcon /> },
          { name: "Peran & Akses",   path: "/users/roles", icon: <UserIcon />, roles: ["superadmin", "mitra"] },
        ],
      },
      {
        icon: <TableIcon />,
        name: "Laporan",
        roles: ["superadmin", "mitra", "admin"],
        subItems: [
          { name: "Laporan Keuangan", path: "/finance/laporan", icon: <PieChartIcon /> },
        ],
      },
      {
        icon: <ListIcon />,
        name: "Pengaturan",
        roles: ["superadmin", "mitra"],
        subItems: [
          { name: "WhatsApp",  path: "/whatsapp",  icon: <BoltIcon />, roles: ["mitra"] },
        ],
      },
    ],
  },
];

// ─── Role filter helpers ───────────────────────────────────────────────────────

function canSee(roles: Role[] | undefined, userRole: string): boolean {
  if (!roles) return true;
  return roles.includes(userRole as Role);
}

// ─── Component ────────────────────────────────────────────────────────────────

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { user } = useAuth();
  const pathname = usePathname();

  const userRole = user?.role ?? "";

  const [openSubmenu, setOpenSubmenu] = useState<{
    key: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isExpandedOrHovered = isExpanded || isHovered || isMobileOpen;

  const isActive = useCallback(
    (path: string) => pathname === path,
    [pathname]
  );

  const isSubmenuOpen = (key: "main" | "others", index: number) =>
    openSubmenu?.key === key && openSubmenu?.index === index;

  const handleSubmenuToggle = (index: number, key: "main" | "others") => {
    setOpenSubmenu((prev) =>
      prev?.key === key && prev?.index === index ? null : { key, index }
    );
  };

  // Auto-open submenu that contains the current path
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i];
        if (item.subItems?.some((sub) => isActive(sub.path))) {
          setOpenSubmenu({ key: group.key, index: i });
          return;
        }
      }
    }
  }, [pathname, isActive]);

  // Measure submenu height when it opens
  useEffect(() => {
    if (openSubmenu === null) return;
    const refKey = `${openSubmenu.key}-${openSubmenu.index}`;
    const el = subMenuRefs.current[refKey];
    if (el) {
      setSubMenuHeight((prev) => ({ ...prev, [refKey]: el.scrollHeight }));
    }
  }, [openSubmenu]);

  const renderNavItem = (
    nav: NavItem,
    index: number,
    groupKey: "main" | "others"
  ) => {
    if (!canSee(nav.roles, userRole)) return null;

    const refKey = `${groupKey}-${index}`;
    const submenuOpen = isSubmenuOpen(groupKey, index);

    if (nav.subItems) {
      const visibleSubs = nav.subItems.filter((s) => canSee(s.roles, userRole));
      if (visibleSubs.length === 0) return null;

      return (
        <li key={nav.name}>
          <button
            onClick={() => handleSubmenuToggle(index, groupKey)}
            className={`menu-item group ${submenuOpen ? "menu-item-active" : "menu-item-inactive"
              } cursor-pointer ${!isExpandedOrHovered ? "lg:justify-center" : "lg:justify-start"
              }`}
          >
            <span className={submenuOpen ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
              {nav.icon}
            </span>
            {isExpandedOrHovered && (
              <>
                <span className="menu-item-text">{nav.name}</span>
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${submenuOpen ? "rotate-180 text-brand-500" : ""}`}
                />
              </>
            )}
          </button>

          {isExpandedOrHovered && (
            <div
              ref={(el) => { subMenuRefs.current[refKey] = el; }}
              className="overflow-hidden transition-all duration-300"
              style={{ height: submenuOpen ? `${subMenuHeight[refKey] ?? 0}px` : "0px" }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {visibleSubs.map((sub) => (
                  <li key={sub.name}>
                    <Link
                      href={sub.path}
                      className={`menu-dropdown-item flex items-center gap-3 ${isActive(sub.path)
                        ? "menu-dropdown-item-active"
                        : "menu-dropdown-item-inactive"
                        }`}
                    >
                      <span className={`w-4 h-4 shrink-0 ${isActive(sub.path)
                        ? "menu-item-icon-active"
                        : "menu-item-icon-inactive"
                        }`}>
                        {sub.icon}
                      </span>
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      );
    }

    if (!nav.path) return null;

    return (
      <li key={nav.name}>
        <Link
          href={nav.path}
          className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"}`}
        >
          <span className={isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
            {nav.icon}
          </span>
          {isExpandedOrHovered && (
            <span className="menu-item-text">{nav.name}</span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${isExpanded || isHovered ? "w-[290px]" : isMobileOpen ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div className={`py-8 flex ${!isExpandedOrHovered ? "lg:justify-center" : "justify-start"}`}>
        <Link href="/">
          {isExpandedOrHovered ? (
            <div className="flex gap-4 items-center">
              <Image src="/images/logo.png" alt="Logo" width={60} height={60} />
              <div className="text-sm font-bold text-gray-800 dark:text-white/90">
                ACI DATA SOLUSINDO
                <div className="font-normal text-xs">Platform Monitoring Jaringan</div>
              </div>
            </div>
          ) : (
            <Image src="/images/logo.png" alt="Logo" width={32} height={32} />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) => canSee(item.roles, userRole));
              if (visibleItems.length === 0) return null;
              return (
                <div key={group.key}>
                  <h2
                    className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpandedOrHovered ? "lg:justify-center" : "justify-start"}`}
                  >
                    {isExpandedOrHovered ? group.label : <HorizontaLDots />}
                  </h2>
                  <ul className="flex flex-col gap-4">
                    {group.items.map((item, i) => renderNavItem(item, i, group.key))}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
