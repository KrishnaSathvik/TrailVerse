import React from 'react';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  style = {},
  onClick,
  type = 'button',
  href,
  target,
  rel,
  ...props
}) => {
  // Base styles that all buttons share
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontFamily: 'inherit',
    fontWeight: '600',
    textDecoration: 'none',
    border: 'none',
    borderRadius: '9999px', // rounded-full
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease-in-out',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    opacity: disabled || loading ? 0.6 : 1,
    // Prevent text selection and focus outline issues
    userSelect: 'none',
    outline: 'none',
    ...style
  };

  // Size variants
  const sizeStyles = {
    xs: {
      padding: '0.375rem 0.75rem',
      fontSize: '0.75rem',
      gap: '0.25rem'
    },
    sm: {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
      gap: '0.375rem'
    },
    md: {
      padding: '0.625rem 1.25rem',
      fontSize: '0.875rem',
      gap: '0.5rem'
    },
    lg: {
      padding: '0.75rem 1.5rem',
      fontSize: '1rem',
      gap: '0.5rem'
    },
    xl: {
      padding: '1rem 2rem',
      fontSize: '1.125rem',
      gap: '0.75rem'
    }
  };

  // Color variants - Proper distinction between all variants
  const variantStyles = {
    primary: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: 'var(--accent-green-dark)',
      hoverBorderColor: 'var(--accent-green-dark)',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    secondary: {
      backgroundColor: 'var(--surface)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border)',
      hoverBackgroundColor: 'var(--surface-hover)',
      hoverBorderColor: 'var(--border-hover)',
      hoverShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--accent-green)',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: 'var(--accent-green)',
      hoverColor: '#ffffff',
      hoverBorderColor: 'var(--accent-green)',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid transparent',
      hoverBackgroundColor: 'var(--surface-hover)',
      hoverBorderColor: 'var(--border)',
      hoverShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    },
    danger: {
      backgroundColor: 'var(--error-red)',
      color: '#ffffff',
      border: '1px solid var(--error-red)',
      hoverBackgroundColor: '#dc2626',
      hoverBorderColor: '#dc2626',
      hoverShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.3), 0 4px 6px -2px rgba(239, 68, 68, 0.2)'
    },
    success: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: 'var(--accent-green-dark)',
      hoverBorderColor: 'var(--accent-green-dark)',
      hoverShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.3), 0 4px 6px -2px rgba(34, 197, 94, 0.2)'
    }
  };

  const currentVariant = variantStyles[variant] || variantStyles.primary;
  const currentSize = sizeStyles[size] || sizeStyles.md;

  const buttonStyles = {
    ...baseStyles,
    ...currentSize,
    backgroundColor: currentVariant.backgroundColor,
    color: currentVariant.color,
    borderColor: currentVariant.border,
    border: currentVariant.border,
    // Ensure text is always visible and inherited by children
    textShadow: 'none'
  };

  const handleMouseEnter = (e) => {
    if (disabled || loading) return;
    e.target.style.backgroundColor = currentVariant.hoverBackgroundColor;
    e.target.style.borderColor = currentVariant.hoverBorderColor;
    e.target.style.boxShadow = currentVariant.hoverShadow;
    if (currentVariant.hoverColor) {
      e.target.style.color = currentVariant.hoverColor;
    }
  };

  const handleMouseLeave = (e) => {
    if (disabled || loading) return;
    e.target.style.backgroundColor = currentVariant.backgroundColor;
    e.target.style.borderColor = currentVariant.border;
    e.target.style.boxShadow = baseStyles.boxShadow;
    e.target.style.color = currentVariant.color;
  };

  const iconElement = Icon && (
    <Icon 
      className={`${size === 'xs' ? 'h-3 w-3' : size === 'sm' ? 'h-4 w-4' : 'h-4 w-4'}`}
      style={{ 
        color: 'inherit',
        fill: 'none', // Lucide icons use stroke, not fill
        stroke: 'currentColor',
        strokeWidth: 2,
        flexShrink: 0
      }}
    />
  );

  const content = (
    <>
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
      )}
      {!loading && Icon && iconPosition === 'left' && iconElement}
      <span style={{ color: 'inherit' }}>{children}</span>
      {!loading && Icon && iconPosition === 'right' && iconElement}
    </>
  );

  // If href is provided, render as anchor tag
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        className={className}
        style={buttonStyles}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={disabled || loading ? (e) => e.preventDefault() : onClick}
        data-button-component="true"
        {...props}
      >
        {content}
      </a>
    );
  }

  // Otherwise render as button
  return (
    <button
      type={type}
      className={className}
      style={buttonStyles}
      disabled={disabled || loading}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-button-component="true"
      {...props}
    >
      {content}
    </button>
  );
};

export default Button;
