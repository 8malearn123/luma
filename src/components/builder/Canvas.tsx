'use client';

import '@/app/s/storefront.css'; // the canvas renders real storefront blocks: same stylesheet as /s/[slug]
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BLOCK_META, type BlockType, type PageBlock, type StorePage } from '@/lib/builder/schema';
import { BlockView } from '../storefront/Blocks';
import { StoreFrame } from '../storefront/Frame';
import type { RenderCtx } from '../storefront/types';
import { useT } from '../I18n';
import { Icon } from '../Icon';

export const DND_NEW = 'application/x-luma-new';
export const DND_MOVE = 'application/x-luma-move';

export interface CanvasHandlers {
  select: (id: string | null) => void;
  dropNew: (type: BlockType, parentId: string | null, index: number) => void;
  dropMove: (id: string, parentId: string | null, index: number) => void;
  nudge: (id: string, d: -1 | 1) => void;
  duplicate: (id: string) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  canDrop: (type: BlockType | null, movingId: string | null, parentId: string | null) => boolean;
}

/** dataTransfer types are readable during dragover; values only on drop */
function dragInfo(e: DragEvent): { kind: 'new' | 'move' | null } {
  const types = Array.from(e.dataTransfer.types);
  return { kind: types.includes(DND_NEW) ? 'new' : types.includes(DND_MOVE) ? 'move' : null };
}

function DropZone({ parentId, index, h, active, dragging }: { parentId: string | null; index: number; h: CanvasHandlers; active: { type: BlockType | null; id: string | null } | null; dragging: boolean }) {
  const t = useT();
  const [over, setOver] = useState(false);
  const ok = active ? h.canDrop(active.type, active.id, parentId) : true;
  if (!dragging) return <div className="bld-dz idle" aria-hidden="true" />;
  return (
    <div
      className={`bld-dz ${over && ok ? 'over' : ''} ${ok ? '' : 'invalid'}`}
      onDragOver={(e) => {
        if (!dragInfo(e).kind || !ok) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = dragInfo(e).kind === 'new' ? 'copy' : 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const nt = e.dataTransfer.getData(DND_NEW) as BlockType;
        const mv = e.dataTransfer.getData(DND_MOVE);
        if (nt) h.dropNew(nt, parentId, index);
        else if (mv) h.dropMove(mv, parentId, index);
      }}
    >
      <span>{ok ? t('builder.drop_here') : t('builder.drop_not_allowed')}</span>
    </div>
  );
}

function BlockChrome({ ctx, block, index, count, parentId, selected, h, dragging, active, setActive, children }: {
  ctx: RenderCtx;
  block: PageBlock;
  index: number;
  count: number;
  parentId: string | null;
  selected: string | null;
  h: CanvasHandlers;
  dragging: boolean;
  active: { type: BlockType | null; id: string | null } | null;
  setActive: (a: { type: BlockType | null; id: string | null } | null) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const isSel = selected === block.id;
  const label = t(`builder.block.${block.type}`);
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      h.select(block.id);
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      h.nudge(block.id, -1);
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      h.nudge(block.id, 1);
    }
  };
  return (
    <div
      className={`bld-block ${isSel ? 'selected' : ''} ${block.visibility.enabled ? '' : 'hidden-block'}`}
      tabIndex={0}
      role="group"
      aria-label={`${label}${block.visibility.enabled ? '' : ` (${t('common.hidden')})`}`}
      aria-current={isSel ? 'true' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        h.select(block.id);
      }}
      onKeyDown={onKey}
    >
      <div className="bld-tools" onClick={(e) => e.stopPropagation()}>
        <span
          className="bld-handle"
          draggable
          title={t('builder.drag')}
          aria-hidden="true"
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_MOVE, block.id);
            e.dataTransfer.effectAllowed = 'move';
            setActive({ type: block.type, id: block.id });
          }}
          onDragEnd={() => setActive(null)}
        >
          <Icon name="drag" size={16} />
        </span>
        <span className="bld-label">{label}{!block.visibility.enabled && ` · ${t('common.hidden')}`}</span>
        <button type="button" className="bld-tool" aria-label={`${t('builder.move_up')}: ${label}`} disabled={index === 0} onClick={() => h.nudge(block.id, -1)}><Icon name="arrowUp" size={15} /></button>
        <button type="button" className="bld-tool" aria-label={`${t('builder.move_down')}: ${label}`} disabled={index === count - 1} onClick={() => h.nudge(block.id, 1)}><Icon name="arrowDown" size={15} /></button>
        <button type="button" className="bld-tool" aria-label={`${t('builder.duplicate')}: ${label}`} onClick={() => h.duplicate(block.id)}><Icon name="copy" size={15} /></button>
        <button type="button" className="bld-tool" aria-label={`${block.visibility.enabled ? t('builder.hide') : t('builder.show')}: ${label}`} aria-pressed={!block.visibility.enabled} onClick={() => h.toggle(block.id)}><Icon name={block.visibility.enabled ? 'eye' : 'eyeOff'} size={15} /></button>
        <button type="button" className="bld-tool danger" aria-label={`${t('common.delete')}: ${label}`} onClick={() => h.remove(block.id)}><Icon name="trash" size={15} /></button>
      </div>
      {BLOCK_META[block.type].container ? (
        <section className="sf-section">
          <div className="sf-container">
            <div className={`sf-columns c${(block.props as { columns?: number }).columns === 3 ? 3 : 2} bld-container`}>
              {(block.children ?? []).length === 0 && <p className="bld-empty-col">{t('builder.empty_container')}</p>}
              {(block.children ?? []).map((ch, i) => (
                <div key={ch.id}>
                  <DropZone parentId={block.id} index={i} h={h} active={active} dragging={dragging} />
                  <BlockChrome ctx={ctx} block={ch} index={i} count={block.children!.length} parentId={block.id} selected={selected} h={h} dragging={dragging} active={active} setActive={setActive} />
                </div>
              ))}
              <DropZone parentId={block.id} index={(block.children ?? []).length} h={h} active={active} dragging={dragging} />
            </div>
          </div>
        </section>
      ) : (
        <div className="bld-content" aria-hidden="false">
          {children ?? <BlockView ctx={ctx} block={block} />}
          {block.type === 'footer' && <p className="bld-note">{t('builder.footer_note')}</p>}
        </div>
      )}
      {parentId === null && null}
    </div>
  );
}

export function Canvas({ ctx, page, selected, h, device, active, setActive }: {
  ctx: RenderCtx;
  page: StorePage;
  selected: string | null;
  h: CanvasHandlers;
  device: 'desktop' | 'mobile';
  active: { type: BlockType | null; id: string | null } | null;
  setActive: (a: { type: BlockType | null; id: string | null } | null) => void;
}) {
  const t = useT();
  const dragging = active !== null;
  const path = page.kind === 'home' ? '/' : page.kind === 'custom' ? `/pages/${page.slug}` : `/${page.kind}`;
  return (
    <div
      className={`bld-canvas ${device}`}
      onClickCapture={(e) => {
        // links are inert while editing
        if ((e.target as HTMLElement).closest('a')) e.preventDefault();
      }}
      onClick={() => h.select(null)}
      onDragOver={(e) => dragInfo(e).kind && e.preventDefault()}
    >
      <div className="bld-frame" aria-label={t('builder.canvas')}>
        <StoreFrame ctx={ctx} currentPath={path}>
          {page.blocks.length === 0 && <div className="bld-empty"><Icon name="layers" size={28} /><p>{t('builder.empty_page')}</p></div>}
          {page.blocks.map((b, i) => (
            <div key={b.id}>
              <DropZone parentId={null} index={i} h={h} active={active} dragging={dragging} />
              <BlockChrome ctx={ctx} block={b} index={i} count={page.blocks.length} parentId={null} selected={selected} h={h} dragging={dragging} active={active} setActive={setActive} />
            </div>
          ))}
          <DropZone parentId={null} index={page.blocks.length} h={h} active={active} dragging={dragging} />
        </StoreFrame>
      </div>
    </div>
  );
}
