import { Brand } from '@/components/shell/Brand';
import { pageT, requireUser } from '@/server/http/page';
import { CreateBusinessForm } from './_components/CreateBusinessForm';

export const metadata = { title: 'Onboarding' };

/** Step 1 of onboarding: create the business (the caller becomes its owner). */
export default async function OnboardingStart() {
  const user = await requireUser();
  const { t } = await pageT(user);
  return (
    <main id="main" className="auth-wrap">
      <div className="auth-card stack" style={{ width: 'min(620px,100%)' }}>
        <Brand />
        <div className="card">
          <h1>{t('onb.title')}</h1>
          <p className="muted small">{t('onb.saved_resume')}</p>
          <div className="steps" aria-label={t('onb.step', { n: 1 })}>
            <span aria-current="step">1 · {t('onb.s1')}</span>
          </div>
          <CreateBusinessForm />
        </div>
      </div>
    </main>
  );
}
