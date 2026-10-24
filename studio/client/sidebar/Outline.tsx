import { addEdge, addGroup, addNode, type RawDiagramLike, type RawEdgeLike, type RawGroupLike, type RawNodeLike } from '../../shared/ops';
import { useStore } from '../store';

interface GroupNode {
  group: RawGroupLike;
  children: GroupNode[];
  nodes: RawNodeLike[];
}

function buildTree(raw: RawDiagramLike): { roots: GroupNode[]; rootNodes: RawNodeLike[] } {
  const groups = raw.groups ?? [];
  const byId = new Map<string, GroupNode>(groups.map((g) => [g.id, { group: g, children: [], nodes: [] }]));
  const roots: GroupNode[] = [];
  for (const g of groups) {
    const gn = byId.get(g.id);
    if (!gn) continue;
    const parent = typeof g.parent === 'string' ? byId.get(g.parent) : undefined;
    if (parent) parent.children.push(gn);
    else roots.push(gn);
  }
  const rootNodes: RawNodeLike[] = [];
  for (const n of raw.nodes) {
    const gn = typeof n.group === 'string' ? byId.get(n.group) : undefined;
    if (gn) gn.nodes.push(n);
    else rootNodes.push(n);
  }
  return { roots, rootNodes };
}

function NodeItemView({ node, depth }: { node: RawNodeLike; depth: number }) {
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.selection);
  const isSelected = selection?.kind === 'node' && selection.id === node.id;
  return (
    <button
      type="button"
      className={`outline-item outline-node-item${isSelected ? ' selected' : ''}`}
      style={{ paddingLeft: 12 + depth * 14 }}
      onClick={() => select({ kind: 'node', id: node.id })}
    >
      {(node.label as string | undefined) ?? node.id}
    </button>
  );
}

function GroupNodeView({ gn, depth }: { gn: GroupNode; depth: number }) {
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.selection);
  const isSelected = selection?.kind === 'group' && selection.id === gn.group.id;
  return (
    <div className="outline-group">
      <button
        type="button"
        className={`outline-item outline-group-item${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: depth * 14 }}
        onClick={() => select({ kind: 'group', id: gn.group.id })}
      >
        {(gn.group.label as string | undefined) ?? gn.group.id}
      </button>
      {gn.nodes.map((n) => (
        <NodeItemView key={n.id} node={n} depth={depth + 1} />
      ))}
      {gn.children.map((c) => (
        <GroupNodeView key={c.group.id} gn={c} depth={depth + 1} />
      ))}
    </div>
  );
}

function EdgeItemView({ edge, index }: { edge: RawEdgeLike; index: number }) {
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.selection);
  const raw = useStore((s) => s.raw);
  const isSelected = selection?.kind === 'edge' && selection.index === index;
  const fromLabel = (raw?.nodes.find((n) => n.id === edge.from)?.label as string | undefined) ?? edge.from;
  const toLabel = (raw?.nodes.find((n) => n.id === edge.to)?.label as string | undefined) ?? edge.to;
  return (
    <button type="button" className={`outline-item outline-edge-item${isSelected ? ' selected' : ''}`} onClick={() => select({ kind: 'edge', index })}>
      {fromLabel} → {toLabel}
    </button>
  );
}

export function Outline() {
  const raw = useStore((s) => s.raw);
  const applyOps = useStore((s) => s.applyOps);
  const select = useStore((s) => s.select);

  if (!raw) return <p className="inspector-empty">YAML invalido -- corrija no editor para ver a arvore aqui.</p>;

  const { roots, rootNodes } = buildTree(raw);
  const edges = raw.edges ?? [];

  return (
    <div className="outline">
      <div className="outline-toolbar">
        <button
          type="button"
          onClick={() => {
            const r = addGroup(raw);
            applyOps(r.ops);
            select({ kind: 'group', id: r.id });
          }}
        >
          + Grupo
        </button>
        <button
          type="button"
          onClick={() => {
            const r = addNode(raw);
            applyOps(r.ops);
            select({ kind: 'node', id: r.id });
          }}
        >
          + Node
        </button>
        <button
          type="button"
          disabled={raw.nodes.length < 2}
          title={raw.nodes.length < 2 ? 'precisa de ao menos 2 componentes' : undefined}
          onClick={() => {
            const a = raw.nodes[0];
            const b = raw.nodes[1];
            if (!a || !b) return;
            applyOps(addEdge(a.id, b.id));
            select({ kind: 'edge', index: edges.length });
          }}
        >
          + Edge
        </button>
      </div>

      <div className="outline-section">
        <h4>Grupos &amp; componentes</h4>
        {roots.length === 0 && rootNodes.length === 0 && <p className="outline-empty">nada ainda</p>}
        {roots.map((gn) => (
          <GroupNodeView key={gn.group.id} gn={gn} depth={0} />
        ))}
        {rootNodes.map((n) => (
          <NodeItemView key={n.id} node={n} depth={0} />
        ))}
      </div>

      <div className="outline-section">
        <h4>Conexoes</h4>
        {edges.length === 0 && <p className="outline-empty">nenhuma</p>}
        {edges.map((e, i) => (
          <EdgeItemView key={i} edge={e} index={i} />
        ))}
      </div>
    </div>
  );
}
