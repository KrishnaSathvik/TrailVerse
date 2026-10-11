import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConversationRecoveryNotice from '../ConversationRecoveryNotice';
afterEach(cleanup);
const recovery = { canRestore:true, deviceOnlyMessages:[{role:'user',content:'My missing question'},{role:'assistant',content:'My missing answer'}], messages:[{role:'user',content:'Already saved'}] };
it('shows quiet optional actions without a card, heading or expanded transcript', () => {
 const restore=vi.fn(), proceed=vi.fn();
 render(<ConversationRecoveryNotice recovery={recovery} onRestore={restore} onContinue={proceed} />);
 expect(screen.queryByRole('heading')).not.toBeInTheDocument();
 expect(screen.getByText('2 messages from this device weren’t saved')).toBeInTheDocument();
 expect(screen.queryByText('My missing question')).not.toBeInTheDocument();
 expect(restore).not.toHaveBeenCalled(); expect(proceed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Review'}));
 expect(screen.getByText('My missing question',{exact:false})).toBeInTheDocument();
 expect(screen.queryByText('Already saved')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Restore'})); expect(restore).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Continue'})); expect(proceed).toHaveBeenCalledOnce();
});
it('does not offer unsafe restores but permits continuing normally', () => {
 render(<ConversationRecoveryNotice recovery={{...recovery,canRestore:false}} />);
 expect(screen.queryByRole('button',{name:'Restore'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Continue'})).toBeEnabled();
});
it('blocks restore during an active write but leaves reconnect available for unresolved status', () => {
 render(<ConversationRecoveryNotice recovery={recovery} busy notice='We couldn’t confirm the restore.' onRetry={vi.fn()} />);
 expect(screen.getByRole('status')).toHaveTextContent('We couldn’t confirm the restore.');
 expect(screen.getByRole('button',{name:'Restore'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Reconnect'})).toBeEnabled();
});
it('is silent for assistant-only local leftovers', () => {
 const {container}=render(<ConversationRecoveryNotice recovery={{...recovery,deviceOnlyMessages:[recovery.deviceOnlyMessages[1]]}} />);
 expect(container).toBeEmptyDOMElement();
});
