import {
  ArrowUpIcon,
  BellIcon,
  BuildingIcon,
  ClapperIcon,
  HomeIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";

export type NavItem = {
  label: string;
  href: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  exact?: boolean;
};

export const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: HomeIcon, exact: true },
  { label: "Earn", href: "/opportunities", icon: ClapperIcon },
  { label: "Wallet", href: "/wallet", icon: WalletIcon },
  { label: "Referrals", href: "/referrals", icon: UsersIcon },
];

export const secondaryNav: NavItem[] = [
  { label: "Withdrawals", href: "/withdrawals", icon: ArrowUpIcon },
  { label: "Notifications", href: "/notifications", icon: BellIcon },
  { label: "Profile", href: "/profile", icon: UserIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
  { label: "Advertiser portal", href: "/advertiser/dashboard", icon: BuildingIcon },
];

export const mobileNavItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: HomeIcon, exact: true },
  { label: "Earn", href: "/opportunities", icon: ClapperIcon },
  { label: "Wallet", href: "/wallet", icon: WalletIcon },
  { label: "Referrals", href: "/referrals", icon: UsersIcon },
];