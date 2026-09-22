type IconProps = { size?: number; className?: string };

function base(size: number | undefined, className: string | undefined) {
  return {
    width: size ?? 20,
    height: size ?? 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export const HomeIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
  </svg>
);

export const PlayIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 4.5 20 12 6 19.5Z" />
  </svg>
);

export const ClapperIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20.2 6 3 11l-.9-2.4c-.3-.8.1-1.7.9-2L5 6M3 11l18 5-1 3.2a2 2 0 0 1-2.4 1.2L3 16ZM12 7V4M9 10v2M15 10v4" />
  </svg>
);

export const WalletIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z" />
    <path d="M16.5 14h.01M17 5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2" />
  </svg>
);

export const ArrowUpIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const UsersIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6" />
  </svg>
);

export const BellIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10.5 20a1.5 1.5 0 0 0 3 0" />
  </svg>
);

export const UserIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  </svg>
);

export const SettingsIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8h0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);

export const LogoutIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const ShieldIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 2 4 5v6c0 5.5 3.5 9.5 8 11 4.5-1.5 8-5.5 8-11V5Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const CheckIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const XIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CopyIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const ClockIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

export const ChevronRightIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const MenuIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const SparklesIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.4-7.4-2.1 2.1M7.7 16.3l-2.1 2.1m13.2 0-2.1-2.1M7.7 7.7 5.6 5.6M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" />
  </svg>
);

export const InfoIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h.01" />
  </svg>
);

export const MegaphoneIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 11v2a1 1 0 0 0 1 1h2l3.5 3.5a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1L6 9H4a1 1 0 0 0-1 1Z" />
    <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" />
  </svg>
);

export const ChartIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 3v18h18" />
    <path d="M7 16v-5M12 16V8M17 16v-8" />
  </svg>
);

export const LayersIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m12 2 9 5-9 5-9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </svg>
);

export const BuildingIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15M15 21v-5h4v5" />
    <path d="M7 8h2M7 11h2M7 14h2M11 8h2M11 11h2M11 14h2M6 21h12" />
  </svg>
);

export const PlusIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const PauseIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const EditIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const ChevronLeftIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const TargetIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export const CalendarIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

export const BanknoteIcon = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);