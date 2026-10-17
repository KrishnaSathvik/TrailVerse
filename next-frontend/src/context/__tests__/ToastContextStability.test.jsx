import React, { useEffect, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastContext';

it('showing a toast does not restart consumer loading effects', () => {
  const restore = vi.fn();
  function Conversation() {
    const { showToast } = useToast();
    const [draft, setDraft] = useState('Reading draft');
    useEffect(() => { restore(); }, [showToast]);
    return <><p>{draft}</p><button onClick={() => {
      setDraft('Draft withdrawn');
      showToast('Could not confirm the draft', 'error', 0);
    }}>Reject</button></>;
  }
  render(<ToastProvider><Conversation /></ToastProvider>);
  expect(restore).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(screen.getByText('Draft withdrawn')).toBeVisible();
  expect(screen.getByText('Could not confirm the draft')).toBeVisible();
  expect(restore).toHaveBeenCalledTimes(1);
});
