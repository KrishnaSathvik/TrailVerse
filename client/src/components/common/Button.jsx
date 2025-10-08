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

  // Color variants - All buttons now use consistent green and white styling
  const variantStyles = {
    primary: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: '#047857',
      hoverBorderColor: '#047857',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    secondary: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: '#047857',
      hoverBorderColor: '#047857',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    outline: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: '#047857',
      hoverBorderColor: '#047857',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    ghost: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: '#047857',
      hoverBorderColor: '#047857',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    danger: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: '#047857',
      hoverBorderColor: '#047857',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    success: {
      backgroundColor: 'var(--accent-green)',
      color: '#ffffff',
      border: '1px solid var(--accent-green)',
      hoverBackgroundColor: '#047857',
      hoverBorderColor: '#047857',
      hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
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
    ...currentVariant,
    // Ensure text is always visible
    textShadow: 'none',
    // Force text color inheritance
    '--button-text-color': currentVariant.color
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
      {children}
      {!loading && Icon && iconPosition === 'right' && iconElement}
    </>
  );

  // If href is provided, render as anchor tag
  if (href) {
    return (
      <>
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
        
      {/* Ensure consistent green and white button styling - scoped to this component */}
      <style jsx>{`
        /* Only target this specific button element with data attribute */
        a[data-button-component="true"] {
          color: #ffffff !important;
          background-color: var(--accent-green) !important;
          border-color: var(--accent-green) !important;
        }
        
        /* Ensure consistent styling in all themes */
        .light a[data-button-component="true"],
        .dark a[data-button-component="true"] {
          color: #ffffff !important;
          background-color: var(--accent-green) !important;
        }
        
        /* Override any inherited text colors */
        a[data-button-component="true"] * {
          color: #ffffff !important;
        }
      `}</style>
      </>
    );
  }

  // Otherwise render as button
  return (
    <>
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
      
      {/* Ensure consistent green and white button styling - scoped to this component */}
      <style jsx>{`
        /* Only target this specific button element with data attribute */
        button[data-button-component="true"] {
          color: #ffffff !important;
          background-color: var(--accent-green) !important;
          border-color: var(--accent-green) !important;
        }
        
        /* Ensure consistent styling in all themes */
        .light button[data-button-component="true"],
        .dark button[data-button-component="true"] {
          color: #ffffff !important;
          background-color: var(--accent-green) !important;
        }
        
        /* Override any inherited text colors */
        button[data-button-component="true"] * {
          color: #ffffff !important;
        }
      `}</style>
    </>
  );
};

export default Button;
