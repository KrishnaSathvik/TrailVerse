import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingScreen from '../LoadingScreen';

describe('LoadingScreen', () => {
  it('should render loading screen with default message', () => {
    render(<LoadingScreen />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render loading screen with custom message', () => {
    const customMessage = 'Please wait while we load your data...';
    render(<LoadingScreen message={customMessage} />);
    
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('should render mountain icon', () => {
    const { container } = render(<LoadingScreen />);
    
    // Check for the mountain icon (SVG with aria-hidden)
    const mountainIcon = container.querySelector('svg');
    expect(mountainIcon).toBeInTheDocument();
    expect(mountainIcon).toHaveAttribute('aria-hidden', 'true');
  });

  it('should render without message when message is empty', () => {
    render(<LoadingScreen message="" />);
    
    // Should not render the message paragraph
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should handle null message gracefully', () => {
    render(<LoadingScreen message={null} />);
    
    // Should not render the message paragraph
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should handle undefined message gracefully', () => {
    render(<LoadingScreen message={undefined} />);
    
    // Should render default message
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render the main container with proper classes', () => {
    const { container } = render(<LoadingScreen />);
    
    const mainDiv = container.firstChild;
    expect(mainDiv).toHaveClass('fixed', 'inset-0', 'flex', 'flex-col', 'items-center', 'justify-center');
  });

  it('should render mountain container with proper styling', () => {
    const { container } = render(<LoadingScreen />);
    
    const mountainContainer = container.querySelector('.h-16.w-16');
    expect(mountainContainer).toBeInTheDocument();
    expect(mountainContainer).toHaveClass('rounded-2xl', 'bg-gradient-to-br', 'from-forest-400', 'to-forest-600');
  });

  it('should render loading bar with animation', () => {
    const { container } = render(<LoadingScreen />);
    
    const loadingBar = container.querySelector('.w-64.h-1');
    expect(loadingBar).toBeInTheDocument();
    
    const animatedBar = container.querySelector('.animate-\\[loading_1\\.5s_ease-in-out_infinite\\]');
    expect(animatedBar).toBeInTheDocument();
  });

  it('should render message with proper styling', () => {
    const { container } = render(<LoadingScreen />);
    
    const messageElement = container.querySelector('p');
    expect(messageElement).toBeInTheDocument();
    expect(messageElement).toHaveClass('mt-4', 'text-sm', 'font-medium');
    expect(messageElement).toHaveTextContent('Loading...');
  });
});
