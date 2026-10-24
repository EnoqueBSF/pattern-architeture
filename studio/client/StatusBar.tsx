import { useStore } from './store';

export function StatusBar() {
  const render = useStore((s) => s.render);

  if (render.status === 'idle' || render.status === 'pending') {
    return <div className="status-bar status-pending">{render.status === 'pending' ? 'Calculando...' : 'Carregando...'}</div>;
  }

  if (render.status === 'error') {
    return <div className="status-bar status-error">Erro: {render.error}</div>;
  }

  if (render.status === 'invalid') {
    const issues = render.result && !render.result.ok ? render.result.issues : [];
    return (
      <div className="status-bar status-invalid">
        Diagrama invalido -- {issues.length} problema(s)
        {issues.length > 0 && (
          <ul className="status-issues">
            {issues.map((issue, i) => (
              <li key={i}>{issue.path ? `${issue.path.join('.')}: ` : ''}{issue.message}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (render.result?.ok) {
    const r = render.result.report;
    const hasViolations = r.violations.length > 0;
    return (
      <div className={`status-bar ${hasViolations ? 'status-error' : 'status-ok'}`}>
        <span>OK valido: {r.nodeCount} nodes, {r.edgeCount} edges, {r.groupCount} grupos</span>
        {' · '}
        <span>{hasViolations ? `FALHA layout: ${r.violations.length} violacoes (bug do motor)` : `OK layout: ${r.layoutWidth}x${r.layoutHeight}px, 0 sobreposicoes`}</span>
        {' · '}
        <span>OK rotas {r.routedCount}/{r.edgeCount}; {r.noteCount} notas</span>
        {r.warnings.length > 0 && (
          <ul className="status-issues status-warnings">
            {r.warnings.map((w, i) => (
              <li key={i}>AVISO: {w}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return <div className="status-bar">...</div>;
}
