import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/platform/ActionForm';
import { generateDraft } from '@/lib/builder/defaults';
import { formatDateTime } from '@/lib/format';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { listTemplates } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.templates.manage')) notFound();
  const { t, locale } = await pageT(p.user);
  const items = await listTemplates(p);
  const sample = JSON.stringify(generateDraft({ businessName: 'Template', businessType: 'salon', character: ['classic'] }), null, 2);
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.templates')}</h1></div>
      <div className="alert info">{t('platform.templates_hint')}</div>
      <div className="table-wrap" style={{ marginBottom: 14 }}>
        <table className="table">
          <thead><tr><th>{t('common.name')}</th><th>{t('common.status')}</th><th>{t('common.created_at')}</th></tr></thead>
          <tbody>
            {items.map((x) => <tr key={x.id as string}><td>{x.name as string}</td><td>{x.status as string}</td><td className="small">{formatDateTime(x.createdAt as Date, { locale })}</td></tr>)}
          </tbody>
        </table>
      </div>
      <section className="card">
        <ActionForm path="/api/v1/platform/templates" submitLabel={t('platform.save_template')} fields={[
          { name: 'name', label: t('common.name'), required: true },
          { name: 'nameEn', label: t('common.name_en') },
          { name: 'description', label: t('common.description'), type: 'textarea' },
          { name: 'status', label: t('common.status'), type: 'select', options: ['draft', 'approved', 'retired'].map((s) => ({ value: s, label: s })), defaultValue: 'draft' },
          { name: 'document', label: t('platform.template_doc'), type: 'json', defaultValue: sample, required: true },
        ]} />
      </section>
    </>
  );
}
