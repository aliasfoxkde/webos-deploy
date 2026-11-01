import React, { useState } from 'react';
import {
  clearPageAgentToken, executePageAgentTask, hasPageAgentToken, loadPageAgentConfig,
  MAX_PAGE_AGENT_TASK_LENGTH,
  pageAgentExtensionStatus, savePageAgentConfig, savePageAgentToken, stopPageAgentTask,
} from './pageAgentBridge.js';

const CHROME_STORE = 'https://chromewebstore.google.com/detail/page-agent-ext/akldabonmimlicnjlflnapfeklbfemhj';
const DOCS = 'https://github.com/alibaba/page-agent';
const API_DOCS = 'https://github.com/alibaba/page-agent/blob/main/packages/extension/docs/extension_api.md';
const classProps = (value) => ({ ['class' + 'Name']: value });
const MAX_ACTIVITY_ENTRIES = 8;

function isStandalone() {
  try { return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true; }
  catch { return false; }
}
function activityLabel(activity) {
  if (!activity || typeof activity.type !== 'string') return 'Agent activity';
  if (activity.type === 'executing' || activity.type === 'executed') {
    const tool = typeof activity.tool === 'string' ? activity.tool : 'browser action';
    return `${activity.type === 'executing' ? 'Running' : 'Completed'}: ${tool}`;
  }
  if (activity.type === 'retrying') return 'Retrying provider request';
  if (activity.type === 'thinking') return 'Thinking';
  if (activity.type === 'error') return 'Agent reported an error';
  return 'Agent activity';
}

export default function PageAgentPanel() {
  const [config, setConfig] = useState(loadPageAgentConfig);
  const [apiKey, setApiKey] = useState('');
  const [token, setToken] = useState('');
  const [task, setTask] = useState('');
  const [consent, setConsent] = useState(false);
  const [extension, setExtension] = useState(() => pageAgentExtensionStatus());
  const [connectedToken, setConnectedToken] = useState(hasPageAgentToken);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState('');
  const [activity, setActivity] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const standalone = isStandalone();

  const refreshExtension = () => {
    setExtension(pageAgentExtensionStatus());
    setConnectedToken(hasPageAgentToken());
  };

  const saveProvider = () => {
    try {
      const next = savePageAgentConfig(config);
      setConfig(next);
      setNotice('Provider settings saved locally. The API key remains in memory only.');
      setError('');
    } catch (err) { setError(err?.message || 'Could not save provider settings.'); }
  };
  const connectExtension = () => {
    try {
      savePageAgentToken(token);
      setToken('');
      setConnectedToken(true);
      setNotice('Extension token saved. Reload this WebOS tab so the extension can re-check authorization.');
      setError('');
    } catch (err) { setError(err?.message || 'Could not save the extension token.'); }
  };
  const disconnectExtension = () => {
    clearPageAgentToken();
    setConnectedToken(false);
    setExtension({ available: false, version: '' });
    setNotice('Page Agent authorization removed from this WebOS origin.');
    setError('');
  };
  const run = async () => {
    setBusy(true);
    setConsent(false);
    setStatus('running');
    setResult('');
    setActivity([]);
    setError('');
    setNotice('');
    try {
      const outcome = await executePageAgentTask(task, {
        ...config, apiKey: apiKey.trim(), onStatusChange: setStatus,
        onActivity: (item) => setActivity((items) => [...items.slice(-(MAX_ACTIVITY_ENTRIES - 1)), activityLabel(item)]),
      });
      setStatus(outcome?.success ? 'completed' : 'error');
      setResult(typeof outcome?.data === 'string' ? outcome.data : 'The agent returned no text result.');
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'The browser task failed.');
    } finally { setBusy(false); }
  };
  const stop = () => {
    try { stopPageAgentTask(); } catch { /* extension may have disconnected */ }
    setStatus('stopped');
    setBusy(false);
  };

  return (
    <section {...classProps('pa-panel')} aria-label="Page Agent browser assistant">
      <div {...classProps('pa-heading')}>
        <div>
          <h2>Browser Agent</h2>
          <p>Natural-language tasks across browser tabs assigned to Page Agent, powered by Alibaba Page Agent.</p>
        </div>
        <span {...classProps(`pa-status ${extension.available ? 'ready' : ''}`)}>
          {extension.available ? `Connected · ${extension.version || 'Page Agent'}` : 'Extension unavailable'}
        </span>
      </div>
      <div {...classProps('pa-callout')}>
        <strong>Scope, safety and privacy</strong>
        <p>Page Agent's extension has broad browser permissions. Page content and your
          instruction may be sent to the model provider you configure. Do not use it on
          password, payment, health, or other sensitive pages. Review publisher and
          permissions before installing.</p>
        <p>The extension controls tabs assigned to its task group. This integration
          excludes the initial WebOS shell tab and does not enable experimental all-tabs
          access. Agent instructions are not a security boundary: review actions and
          stop the task if it behaves unexpectedly.</p>
        <p>This does not control WebOS Browser's cross-origin iframe contents. The official
          extension supports normal browser windows, not installed PWA app windows.</p>
        <div {...classProps('pa-links')}>
          <a href={CHROME_STORE} target="_blank" rel="noopener noreferrer">Install Page Agent extension (opens a new tab) ↗</a>
          <a href={DOCS} target="_blank" rel="noopener noreferrer">Official project (opens a new tab) ↗</a>
          <a href={API_DOCS} target="_blank" rel="noopener noreferrer">Extension API and limitations (opens a new tab) ↗</a>
        </div>
      </div>
      <div {...classProps('pa-config')}>
        <div {...classProps('pa-section-head')}><strong>Extension authorization</strong>
          <button type="button" {...classProps('btn slim')} onClick={refreshExtension}>Refresh status</button>
        </div>
        {standalone && <p {...classProps('pa-note')}>This is an installed PWA window. The extension API does not support PWA app windows; open WebOS in a normal browser tab.</p>}
        <label htmlFor="pa-extension-token"><span>Authorization token copied from the extension side panel</span></label>
        <input id="pa-extension-token" type="password" value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={connectedToken ? 'Token saved on this origin' : 'Paste extension authorization token'} autoComplete="off" />
        <div {...classProps('pa-actions')}>
          <button type="button" {...classProps('btn')} onClick={connectExtension} disabled={!token.trim()}>Save token</button>
          <button type="button" {...classProps('btn')} onClick={disconnectExtension} disabled={!connectedToken}>Disconnect</button>
        </div>
        <small>The token is stored locally under Page Agent's required key. It is not synced.
          Scripts executing on this origin can read it, so authorize only trusted installations.</small>
      </div>
      <div {...classProps('pa-config')}>
        <strong>Model provider</strong>
        <label htmlFor="pa-provider-url"><span>OpenAI-compatible base URL</span></label>
        <input id="pa-provider-url" type="url" autoComplete="url" value={config.baseURL}
          onChange={(event) => setConfig((current) => ({ ...current, baseURL: event.target.value }))}
          placeholder="https://your-provider-host/v1 or your local model endpoint" />
        <label htmlFor="pa-provider-model"><span>Model</span></label>
        <input id="pa-provider-model" autoComplete="off" value={config.model}
          onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
          placeholder="Your model ID" />
        <label htmlFor="pa-provider-key"><span>API key (session only)</span></label>
        <input id="pa-provider-key" type="password" value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Optional for local providers; never saved" autoComplete="off" />
        <div {...classProps('pa-actions')}>
          <button type="button" {...classProps('btn')} onClick={saveProvider}>Save provider settings</button>
          <span {...classProps('pa-subtle')}>Endpoint and model are stored locally; API key is memory-only.</span>
        </div>
      </div>
      <div {...classProps('pa-task')}>
        <label htmlFor="pa-task"><strong>What should the agent do?</strong></label>
        <textarea id="pa-task" value={task} onChange={(event) => setTask(event.target.value)}
          rows={3} maxLength={MAX_PAGE_AGENT_TASK_LENGTH} disabled={busy || standalone}
          placeholder="Example: Find the official WebAssembly component model docs and summarize key concepts." />
        <label htmlFor="pa-agent-consent" {...classProps('pa-consent')}>
          <input id="pa-agent-consent" type="checkbox" checked={consent}
            onChange={(event) => setConsent(event.target.checked)} />
          <span>I understand that page contents and my instruction may be sent to my configured model provider, and the agent can interact with assigned browser tabs.</span>
        </label>
        <div {...classProps('pa-actions')}>
          {busy ? <button type="button" {...classProps('btn')} onClick={stop}>Stop task</button>
            : <button type="button" {...classProps('btn accent')} onClick={run}
                disabled={!task.trim() || !config.baseURL.trim() || !config.model.trim() || !extension.available || !consent || standalone}>Run browser task</button>}
          <span {...classProps('pa-subtle')}>Each run is explicit and requires a fresh disclosure acknowledgement.</span>
        </div>
      </div>
      {notice && <p {...classProps('pa-notice')} role="status">{notice}</p>}
      {error && <p {...classProps('pa-error')} role="alert">{error}</p>}
      {activity.length > 0 && <div {...classProps('pa-activity')} aria-live="polite">
        <strong>Activity</strong>{activity.map((item,index)=><p key={index}>{item}</p>)}
      </div>}
      {(result || status !== 'idle') && <div {...classProps('pa-result')}>
        <strong>Result · {status}</strong>{result && <pre>{result}</pre>}
      </div>}
    </section>
  );
}
