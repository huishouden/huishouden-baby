import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { signInSilently } from '@huishouden/pwa-kit/auth';
import { markJoined, saveMyProfile, watchHousehold, type Household, type HouseholdState } from '@huishouden/pwa-kit/household';
import { useRole } from '@huishouden/pwa-kit/react/roles';
import type { Role } from '@huishouden/pwa-kit/roles';
import { auth, db, googleClientId, signInWithGoogle, signOutEverywhere } from './data/firebase';
import { useLiveStore } from './data/useLiveStore';
import { useDemoStore } from './data/useDemoStore';
import { DEMO_NOW, type DemoScenario } from './lib/demo';
import { ClockProvider } from '@huishouden/pwa-kit/react/clock';
import { BabyApp } from './BabyApp';
import { Header } from './components/Header';
import { PORTAL_URL } from './lib/portal';
import { Chip, SampleBanner, cardClass, primaryButton, useToast } from '@huishouden/pwa-kit/react/ui';
import { t, useLang, useT } from './i18n';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  // Signs in without a click when the browser is signed in to Google and has used the app before.
  useEffect(() => {
    if (googleClientId) void signInSilently(auth, googleClientId);
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setSignInError(t('signIn.failed'));
    } finally {
      setSigningIn(false);
    }
  }, []);
  const signOut = useCallback(() => void signOutEverywhere(), []);

  const frame = { onSignIn: signIn, onSignOut: signOut, signingIn };

  if (user === undefined) return <Plain user={null} {...frame} hideSignIn />;
  if (user === null) return <DemoApp {...frame} signInError={signInError} />;
  return <SignedIn key={user.uid} user={user} {...frame} />;
}

interface FrameProps {
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
}

function SignedIn({ user, ...frame }: FrameProps & { user: User }) {
  const t = useT();
  const email = (user.email ?? '').toLowerCase();
  const [state, setState] = useState<HouseholdState>({ status: 'loading' });
  useEffect(() => (email ? watchHousehold(db, email, setState) : undefined), [email]);
  const household = state.status === 'ready' ? state.household : null;
  useEffect(() => {
    if (household) markJoined(db, household, email).catch(() => {});
  }, [household, email]);
  // Members' names and photos come from their own sign-ins (shown in the portal and on entries).
  const householdId = household?.id;
  useEffect(() => {
    if (householdId) saveMyProfile(db, householdId, user).catch(() => {});
  }, [householdId, user]);

  if (state.status === 'ready') return <LiveApp household={state.household} user={user} {...frame} />;
  if (state.status === 'loading') return <Plain user={user} {...frame}>{t('household.finding')}</Plain>;
  if (state.status === 'error')
    return (
      <Plain user={user} {...frame}>
        {t('household.unreachable')}
      </Plain>
    );
  return (
    <Plain user={user} {...frame}>
      <h2 className="text-2xl font-semibold text-ink">{t('household.noneTitle')}</h2>
      <p className="mt-2">{t('household.noneBody', { email: user.email ?? '' })}</p>
      <a className={`${primaryButton} mt-5`} href={PORTAL_URL}>
        {t('household.openPortal')}
      </a>
    </Plain>
  );
}

function LiveApp({ household, user, ...frame }: FrameProps & { household: Household; user: User }) {
  const { toast, notify, fail, clear } = useToast();
  const me = (user.email ?? '').toLowerCase();
  const { role } = useRole(household, me);
  const store = useLiveStore(household.id, me, household.members, role, fail);
  const read = useCallback(() => Date.now(), []);
  return (
    <ClockProvider read={read}>
      <BabyApp store={store} user={user} householdId={household.id} {...frame} toast={toast} notify={notify} clearToast={clear} />
    </ClockProvider>
  );
}

/** The sample as a helper or kid would see it (`?as=helper`), for screenshots of their view. */
function demoRole(): Role {
  const as = new URLSearchParams(location.search).get('as');
  return as === 'helper' || as === 'kid' || as === 'member' ? as : 'admin';
}

function initialScenario(): DemoScenario {
  return new URLSearchParams(location.search).get('demo') === 'after' ? 'after' : 'before';
}

/** Signed out: the app with invented sample data, so it can be tried and screenshotted. */
function DemoApp({ signInError, ...frame }: FrameProps & { signInError: string | null }) {
  const [scenario, setScenario] = useState<DemoScenario>(initialScenario);
  const loadedAt = useMemo(() => Date.now(), []);
  // The demo's clock starts at a fixed moment in 2031 and then runs normally.
  const read = useCallback(() => DEMO_NOW + (Date.now() - loadedAt), [loadedAt]);
  const choose = (s: DemoScenario) => {
    setScenario(s);
    const url = new URL(location.href);
    if (s === 'after') url.searchParams.set('demo', 'after');
    else url.searchParams.delete('demo');
    history.replaceState(null, '', url);
  };
  // The sample's checklists start in the page's language, so a new language starts them again.
  const { lang } = useLang();
  return (
    <ClockProvider read={read}>
      <DemoInner key={`${scenario}-${lang}`} scenario={scenario} read={read} {...frame} onScenario={choose} signInError={signInError} />
    </ClockProvider>
  );
}

function DemoInner({ scenario, read, onScenario, signInError, ...frame }: FrameProps & {
  scenario: DemoScenario;
  read: () => number;
  onScenario: (s: DemoScenario) => void;
  signInError: string | null;
}) {
  const t = useT();
  const { toast, notify, clear } = useToast();
  const store = useDemoStore(scenario, read, demoRole());
  const banner = (
    <SampleBanner text={t('sample.banner')} notice={signInError ?? undefined}>
      <div className="flex gap-2" role="group" aria-label={t('sample.group')}>
        <Chip active={scenario === 'before'} onClick={() => onScenario('before')}>
          {t('sample.before')}
        </Chip>
        <Chip active={scenario === 'after'} onClick={() => onScenario('after')}>
          {t('sample.after')}
        </Chip>
      </div>
    </SampleBanner>
  );
  return <BabyApp store={store} user={null} {...frame} toast={toast} notify={notify} clearToast={clear} banner={banner} />;
}

function Plain({ user, children, hideSignIn, ...frame }: FrameProps & { user: User | null; children?: ReactNode; hideSignIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
      <Header tabs={[]} tab="" onTab={() => {}} user={hideSignIn ? undefined : user} {...frame} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        {children && <div className={`${cardClass} max-w-2xl p-6 text-lg text-muted`}>{children}</div>}
      </main>
    </div>
  );
}
