import {
  BanknoteIcon,
  BuildingIcon,
  ChartIcon,
  InfoIcon,
  LayersIcon,
  MegaphoneIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { NavItem } from "@/components/app/nav";

export const adminPrimaryNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: MegaphoneIcon, exact: true },
  { label: "Users", href: "/admin/users", icon: UsersIcon },
  { label: "Advertisers", href: "/admin/advertisers", icon: BuildingIcon },
  { label: "Campaigns", href: "/admin/campaigns", icon: LayersIcon },
];

export const adminSecondaryNav: NavItem[] = [
  { label: "Withdrawals", href: "/admin/withdrawals", icon: BanknoteIcon },
  { label: "Risk", href: "/admin/risk", icon: ShieldIcon },
  { label: "Financials", href: "/admin/financials", icon: ChartIcon },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon },
  { label: "System", href: "/admin/system", icon: InfoIcon },
];

export const adminMobileNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: MegaphoneIcon, exact: true },
  { label: "Users", href: "/admin/users", icon: UsersIcon },
  { label: "Withdrawals", href: "/admin/withdrawals", icon: BanknoteIcon },
  { label: "Risk", href: "/admin/risk", icon: ShieldIcon },
];