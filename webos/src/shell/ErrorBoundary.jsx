import React from 'react';

/* Render-crash containment. React unmounts the ENTIRE tree when anything
   throws during render with no boundary above it — including a rejected
   lazy import (a stale cached shell asking for a hashed chunk that no
   longer exists after an update: the "clicked an app and the whole desktop
   went blank" class). Two tiers:
   - <ErrorBoundary soft onClose> around each plugin window: one broken app
     becomes an in-window card; the rest of the desktop keeps running.
   - <HardBoundary> at the root: the shell itself never blanks; worst case
     is a recovery card with a Reload button. The message renders in the
     card — src/ has no console convention, the DOM is the error surface. */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    const { children, label, soft, onClose } = this.props;
    if (!error) return children;
    const msg = String(error?.message || error);
    const chunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg);
    return (
      <div className="bdry" role="alert">
        <h3>{label ? `${label} can’t start` : 'Something went wrong'}</h3>
        <p className="bdry-msg">{chunk
          ? 'Its code failed to load — usually a stale cached page after an update. Reloading fetches the current version.'
          : msg.slice(0, 300)}</p>
        <div className="bdry-actions">
          <button type="button" className="btn accent" onClick={() => window.location.reload()}>Reload</button>
          {soft && onClose && <button type="button" className="btn" onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }
}

export const HardBoundary = ({ children }) => <ErrorBoundary label="WebOS">{children}</ErrorBoundary>;
export default ErrorBoundary;
