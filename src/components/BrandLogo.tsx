import React from 'react';

export const BRAND_NAME = 'AEGEA';

/**
 * Self-contained vector SVG emblem inspired by Hellenic Cycladic marble columns and Aegean Cobalt blue.
 */
export const BRAND_LOGO_SVG_STRING = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#0D5EAF"/>
  <rect x="4" y="4" width="56" height="56" rx="12" stroke="#FBBF24" stroke-width="1.5" stroke-opacity="0.8"/>
  <path d="M16 24L32 13L48 24H16Z" fill="#FBBF24"/>
  <rect x="15" y="25.5" width="34" height="2.8" rx="1" fill="#E0F2FE"/>
  <rect x="19" y="30" width="5" height="17" rx="1.2" fill="#FFFFFF"/>
  <rect x="29.5" y="30" width="5" height="17" rx="1.2" fill="#FFFFFF"/>
  <rect x="40" y="30" width="5" height="17" rx="1.2" fill="#FFFFFF"/>
  <rect x="14" y="48.5" width="36" height="3.2" rx="1.2" fill="#FBBF24"/>
  <circle cx="32" cy="19.5" r="1.8" fill="#082F5E"/>
</svg>`;

interface BrandLogoMarkProps {
  className?: string;
}

export const BrandLogoMark: React.FC<BrandLogoMarkProps> = ({ className = 'w-9 h-9' }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#0D5EAF" />
    <rect x="4" y="4" width="56" height="56" rx="12" stroke="#FBBF24" strokeWidth="1.5" strokeOpacity="0.85" />
    <path d="M16 24L32 13L48 24H16Z" fill="#FBBF24" />
    <rect x="15" y="25.5" width="34" height="2.8" rx="1" fill="#E0F2FE" />
    <rect x="19" y="30" width="5" height="17" rx="1.2" fill="#FFFFFF" />
    <rect x="29.5" y="30" width="5" height="17" rx="1.2" fill="#FFFFFF" />
    <rect x="40" y="30" width="5" height="17" rx="1.2" fill="#FFFFFF" />
    <rect x="14" y="48.5" width="36" height="3.2" rx="1.2" fill="#FBBF24" />
    <circle cx="32" cy="19.5" r="1.8" fill="#082F5E" />
  </svg>
);

interface BrandLockupProps {
  brandName?: string;
  subtitle: string;
  darkSurface?: boolean;
}

export const BrandLockup: React.FC<BrandLockupProps> = ({
  brandName = BRAND_NAME,
  subtitle,
  darkSurface = false,
}) => (
  <div className="inline-flex items-center gap-2.5 text-start shrink-0">
    <BrandLogoMark className="w-9 h-9 sm:w-10 sm:h-10 shrink-0" />
    <div className="flex flex-col leading-none">
      <span
        className={`font-editorial text-lg sm:text-xl font-bold tracking-tight ${
          darkSurface ? 'text-white' : 'text-[#082F5E] dark:text-white'
        }`}
      >
        {brandName}
      </span>
      <span
        className={`text-[10px] sm:text-[11px] font-semibold tracking-wide mt-0.5 ${
          darkSurface ? 'text-amber-300' : 'text-[#0D5EAF] dark:text-sky-300'
        }`}
      >
        {subtitle}
      </span>
    </div>
  </div>
);
