import { Inspector } from './Inspector';
import { Outline } from './Outline';

export function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar-outline">
        <Outline />
      </div>
      <div className="sidebar-inspector">
        <Inspector />
      </div>
    </div>
  );
}
