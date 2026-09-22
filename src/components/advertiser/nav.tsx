import {
  BanknoteIcon,
  BuildingIcon,
  ChartIcon,
  ClapperIcon,
  LayersIcon,
  MegaphoneIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { NavItem } from "@/components/app/nav";

export const advertiserPrimaryNav: NavItem[] = [
  { label: "Dashboard", href: "/advertiser/dashboard", icon: MegaphoneIcon, exact: true },
  { label: "Campaigns", href: "/advertiser/campaigns", icon: LayersIcon },
  { label: "Analytics", href: "/advertiser/analytics", icon: ChartIcon },
  { label: "Creatives", href: "/advertiser/creatives", icon: ClapperIcon },
];

export const advertiserSecondaryNav: NavItem[] = [
  { label: "Billing", href: "/advertiser/billing", icon: BanknoteIcon },
  { label: "Team", href: "/advertiser/team", icon: UsersIcon },
  { label: "Settings", href: "/advertiser/settings", icon: SettingsIcon },
];

export const advertiserMobileNav: NavItem[] = [
  { label: "Home", href: "/advertiser/dashboard", icon: BuildingIcon, exact: true },
  { label: "Campaigns", href: "/advertiser/campaigns", icon: LayersIcon },
  { label: "Billing", href: "/advertiser/billing", icon: BanknoteIcon },
  { label: "Team", href: "/advertiser/team", icon: UsersIcon },
];