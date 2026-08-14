"use client";

import React from 'react';

interface SomniaLogoProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
  animate?: boolean;
}

/**
 * The console badge. Previously an indigo/purple gradient with soft glow and
 * rounded corners - none of which exist anywhere else in the retro-console
 * language. Redrawn as a plain ink-bordered block in the market blue, the
 * same way every other raised surface in this language is built.
 */
const SomniaLogo: React.FC<SomniaLogoProps> = ({ className = '', size = 'medium' }) => {
  const sizeClasses = {
    small: 'w-12 h-12 text-lg',
    medium: 'w-20 h-20 text-2xl',
    large: 'w-28 h-28 text-3xl',
  };

  return (
    <div
      className={`somnia-logo ${sizeClasses[size]} flex items-center justify-center font-extrabold relative ${className}`}
      style={{
        background: 'var(--rc-blue)',
        color: 'var(--rc-ink)',
        border: 'var(--rc-border-thin)',
        boxShadow: 'var(--rc-shadow-low)',
        fontFamily: 'var(--rc-font-pixel)',
      }}
    >
      S
    </div>
  );
};

export default SomniaLogo;
