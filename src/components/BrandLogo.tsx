"use client";

import { useState } from "react";

interface BrandLogoProps {
  size?: number;
  className?: string;
  fallbackInitials?: string;
}

export function BrandLogo({ size = 64, className = "", fallbackInitials = "LE" }: BrandLogoProps) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    // Fallback: show initials
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600 text-white font-bold rounded-xl ${className}`}
        style={{ width: size, height: size, fontSize: size / 3 }}
      >
        {fallbackInitials}
      </div>
    );
  }

  return (
    <img
      src="/branding/los-esperados.png"
      alt="Los Esperados"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setImageError(true)}
      loading="eager"
    />
  );
}
