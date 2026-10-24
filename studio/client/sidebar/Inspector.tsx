import { useStore } from '../store';
import { DiagramForm } from './DiagramForm';
import { EdgeForm } from './EdgeForm';
import { GroupForm } from './GroupForm';
import { NodeForm } from './NodeForm';

export function Inspector() {
  const selection = useStore((s) => s.selection);

  if (selection === null) return <DiagramForm />;
  if (selection.kind === 'node') return <NodeForm id={selection.id} />;
  if (selection.kind === 'group') return <GroupForm id={selection.id} />;
  return <EdgeForm index={selection.index} />;
}
