'use client';

import { useT } from '../I18n';
import { Icon } from '../Icon';

/** Browser print / "Save as PDF": Arabic is shaped correctly by the browser. */
export function PrintButton() {
  const t = useT();
  return (
    <button type="button" className="btn btn-gold btn-sm" onClick={() => window.print()}>
      <Icon name="download" size={16} /> {t('inv.print')}
    </button>
  );
}
