'use client';

import Link from 'next/link';
import { logDistributionCta } from '@/utils/analytics';

function trackClick(channel, ctaId, label, destination) {
  logDistributionCta({ channel, ctaId, label, destination });
}

/** External link with distribution funnel tracking (ChatGPT Apps Directory, etc.). */
export function TrackedOutboundLink({
  channel,
  ctaId,
  label,
  href,
  children,
  className,
  style,
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onClick={() => trackClick(channel, ctaId, label, href)}
    >
      {children}
    </a>
  );
}

/** Internal link on /chatgpt or /mcp with distribution funnel tracking. */
export function TrackedCtaLink({
  channel,
  ctaId,
  label,
  href,
  children,
  className,
  style,
}) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() => trackClick(channel, ctaId, label, href)}
    >
      {children}
    </Link>
  );
}

/** Copy MCP connector URL to clipboard with tracking. */
export function McpConnectorCopyButton({
  mcpUrl,
  className,
  style,
  children = 'Copy connector URL',
}) {
  const handleCopy = async () => {
    logDistributionCta({
      channel: 'mcp',
      ctaId: 'copy_mcp_url',
      label: 'Copy MCP connector URL',
      destination: mcpUrl,
    });
    try {
      await navigator.clipboard.writeText(mcpUrl);
    } catch {
      const el = document.createElement('textarea');
      el.value = mcpUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <button type="button" className={className} style={style} onClick={handleCopy}>
      {children}
    </button>
  );
}
