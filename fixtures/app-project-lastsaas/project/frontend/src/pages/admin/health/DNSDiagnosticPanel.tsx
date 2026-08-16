import { useState } from 'react';
import { adminApi } from '../../../api/client';

export default function DNSDiagnosticPanel() {
  const [hostname, setHostname] = useState('localhost');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const runDiagnostic = async () => {
    if (!hostname.trim()) return;
    setLoading(true);
    setOutput('');
    setError('');
    try {
      const result = await adminApi.runHealthDNSDiagnostic(hostname.trim());
      if (result.error) {
        setError(result.error);
      }
      setOutput(result.output || '');
    } catch {
      setError('The DNS diagnostic could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-dark-900/50 backdrop-blur-sm border border-dark-800 rounded-2xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-dark-300 uppercase tracking-wide">DNS Diagnostic</h2>
        <p className="text-xs text-dark-500 mt-1">Check how a hostname resolves from the application server.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={hostname}
          onChange={e => setHostname(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) runDiagnostic(); }}
          className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
          placeholder="Hostname"
          aria-label="Hostname"
          disabled={loading}
        />
        <button
          onClick={runDiagnostic}
          disabled={loading || !hostname.trim()}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
        >
          {loading ? 'Checking...' : 'Check Hostname'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {output && (
        <pre className="mt-4 p-3 bg-dark-950 border border-dark-800 rounded-lg text-xs text-dark-300 overflow-x-auto whitespace-pre-wrap">
          {output}
        </pre>
      )}
    </section>
  );
}
