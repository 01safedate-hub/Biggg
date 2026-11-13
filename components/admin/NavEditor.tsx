"use client";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "./dnd-modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Pin, PinOff } from "lucide-react";
import type { NavGroup, NavItem } from "./Sidebar";
import { MAX_PINS, PINNED_LABEL, type NavLayout } from "@/lib/nav-layout";

function Row({ item, pinned, canPin, first, last, onPin, onMove }: {
  item: NavItem; pinned: boolean; canPin: boolean; first: boolean; last: boolean;
  onPin: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.href });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md border bg-white px-1 py-1 text-sm ${isDragging ? "z-10 border-brand shadow-lg" : "border-line"}`}>
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag ${item.label}`}
        className="cursor-grab touch-none rounded p-1.5 text-ink-mute hover:bg-canvas active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
      <span className="min-w-0 flex-1 truncate pl-1 font-medium text-ink-soft" title={item.label}>{item.label}</span>
      <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${item.label} up`} className="rounded p-1 text-ink-mute hover:bg-canvas disabled:opacity-30 lg:hidden"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${item.label} down`} className="rounded p-1 text-ink-mute hover:bg-canvas disabled:opacity-30 lg:hidden"><ArrowDown className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onPin} disabled={!pinned && !canPin} aria-pressed={pinned} aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
        title={pinned ? "Unpin" : canPin ? "Pin to the top" : `You can pin up to ${MAX_PINS}`}
        className={`rounded p-1 hover:bg-canvas disabled:opacity-30 ${pinned ? "text-brand" : "text-ink-mute"}`}>{pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>
    </li>
  );
}

export function NavEditor({ groups, layout, onChange }: { groups: NavGroup[]; layout: NavLayout; onChange: (l: NavLayout) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const pinnedSet = new Set(layout.pinned);

  function setGroupOrder(label: string, hrefs: string[]) {
    if (label === PINNED_LABEL) onChange({ ...layout, pinned: hrefs });
    else onChange({ ...layout, order: { ...layout.order, [label]: hrefs } });
  }
  function move(g: NavGroup, idx: number, dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= g.items.length) return;
    setGroupOrder(g.label, arrayMove(g.items.map((i) => i.href), idx, to));
  }
  function togglePin(href: string) {
    if (pinnedSet.has(href)) onChange({ ...layout, pinned: layout.pinned.filter((h) => h !== href) });
    else if (layout.pinned.length < MAX_PINS) onChange({ ...layout, pinned: [...layout.pinned, href] });
  }
  function onDragEnd(g: NavGroup) {
    return (e: DragEndEvent) => {
      if (!e.over || e.active.id === e.over.id) return;
      const hrefs = g.items.map((i) => i.href);
      const from = hrefs.indexOf(String(e.active.id));
      const to = hrefs.indexOf(String(e.over.id));
      if (from < 0 || to < 0) return;
      setGroupOrder(g.label, arrayMove(hrefs, from, to));
    };
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-ink-mute">{g.label}</p>
          {g.label === PINNED_LABEL && <p className="px-1 text-[11px] text-ink-mute">Always at the top. Up to {MAX_PINS}.</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd(g)}>
            <SortableContext items={g.items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
              <ul className="mt-2 space-y-1">
                {g.items.map((i, idx) => (
                  <Row key={i.href} item={i} pinned={pinnedSet.has(i.href)} canPin={layout.pinned.length < MAX_PINS}
                    first={idx === 0} last={idx === g.items.length - 1} onPin={() => togglePin(i.href)} onMove={(d) => move(g, idx, d)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      ))}
    </div>
  );
}
