import React from 'react';

const Button = ({
  children,
  variant = 'secondary',
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
    boxShadow: 'var(--shadow)',
    opacity: disabled || loading ? 0.6 : 1,
    // Prevent text selection and focus outline issues
    userSelect: 'none',
    WebkitUserSelect: 'none',
    MozUserSelect: 'none',
    msUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    WebkitTouchCallout: 'none',
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
      borderColor: 'var(--accent-green)',
      hoverBackgroundColor: 'var(--accent-green-dark)',
      hoverBorderColor: 'var(--accent-green-dark)',
      hoverShadow: 'var(--shadow-lg)'
    },
    secondary: {
      backgroundColor: 'var(--surface)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border)',
      hoverBackgroundColor: 'var(--surface-hover)',
      hoverBorderColor: 'var(--border-hover)',
      hoverShadow: 'var(--shadow-lg)'
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--accent-green)',
      borderColor: 'var(--accent-green)',
      hoverBackgroundColor: 'var(--accent-green)',
      hoverColor: '#ffffff',
      hoverBorderColor: 'var(--accent-green)',
      hoverShadow: 'var(--shadow-lg)'
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-primary)',
      borderColor: 'transparent',
      hoverBackgroundColor: 'var(--surface-hover)',
      hoverBorderColor: 'var(--border)',
      hoverShadow: 'var(--shadow-lg)'
    },
    danger: {
      backgroundColor: 'var(--error-red)',
      color: '#ffffff',
      borderColor: 'var(--error-red)',
      hoverBackgroundColor: '#dc2626',
      hoverBorderColor: '#dc2626',
      hoverShadow: 'var(--shadow-lg)'
    },
    success: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      borderColor: 'var(--accent-green)',
      hoverBackgroundColor: 'var(--accent-green-dark)',
      hoverBorderColor: 'var(--accent-green-dark)',
      hoverShadow: 'var(--shadow-lg)'
    }
  };

  const currentVariant = variantStyles[variant] || variantStyles.secondary;
  const currentSize = sizeStyles[size] || sizeStyles.md;

  const buttonStyles = {
    ...baseStyles,
    ...currentSize,
    backgroundColor: currentVariant.backgroundColor,
    color: currentVariant.color,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: currentVariant.borderColor,
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

  const handleMouseDown = (e) => {
    if (disabled || loading) return;
    // Add pressed state
    e.target.style.transform = 'scale(0.98)';
    e.target.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.1)';
  };

  const handleMouseUp = (e) => {
    if (disabled || loading) return;
    // Reset pressed state
    e.target.style.transform = 'scale(1)';
    e.target.style.boxShadow = currentVariant.hoverShadow || baseStyles.boxShadow;
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
        <div 
          className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" 
          unselectable="on"
        />
      )}
      {!loading && Icon && iconPosition === 'left' && iconElement}
      <span 
        className="button-text-no-select"
        unselectable="on"
        style={{ 
          color: 'inherit',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
          pointerEvents: 'none'
        }}
      >{children}</span>
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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={disabled || loading ? (e) => e.preventDefault() : onClick}
        data-button-component="true"
        unselectable="on"
        draggable="false"
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
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      data-button-component="true"
      unselectable="on"
      draggable="false"
      {...props}
    >
      {content}
    </button>
  );
};

export default Button;
