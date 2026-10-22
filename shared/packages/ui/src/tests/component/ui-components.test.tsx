import { LanguageProvider } from '@sanny/i18n';
import { ThemeProvider } from '@sanny/styles';
import { useContext, type ReactNode } from 'react';
import { MotionConfigContext } from 'framer-motion';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  AppShell,
  ButtonGroup,
  Checkbox,
  Error as ErrorPage,
  Settings,
  ToastViewport,
  showErrorToast,
  showToast,
  retriggerToast,
} from '../../index.js';
import {
  dismissToast,
  getToasts,
  subscribeToToasts,
} from '../../utils/toast.js';

function renderWithProviders(ui: ReactNode) {
  return render(
    <ThemeProvider>
      <LanguageProvider>{ui}</LanguageProvider>
    </ThemeProvider>
  );
}

function prepareEnglishLightPreferences() {
  localStorage.setItem('language', 'en');
  document.cookie = 'language=en; path=/';
  localStorage.setItem('theme', 'light');
  document.cookie = 'theme=light; path=/';
}

describe('shared UI controls', () => {
  it('shares user motion preferences and transition timing through the theme provider', () => {
    let motionPreferences;
    function MotionProbe() {
      motionPreferences = useContext(MotionConfigContext);
      return null;
    }

    renderWithProviders(<MotionProbe />);

    expect(motionPreferences).toMatchObject({
      reducedMotion: 'user',
      transition: { duration: 0.18, ease: [0.2, 0.7, 0.2, 1] },
    });
  });

  it('provides the same accessible frame for authentication routes', () => {
    prepareEnglishLightPreferences();
    const router = createMemoryRouter([
      {
        path: '/',
        element: <AppShell variant="auth">Account verification</AppShell>,
      },
    ]);
    renderWithProviders(<RouterProvider router={router} />);

    expect(screen.getByRole('banner')).toHaveTextContent('Authentication');
    expect(
      screen.getByRole('link', { name: 'Skip to main content' })
    ).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it.each(['public', 'auth'] as const)(
    'navigates home through the router without resetting dark mode in the %s shell',
    async (variant) => {
      const user = userEvent.setup();
      prepareEnglishLightPreferences();
      localStorage.setItem('theme', 'dark');
      document.cookie = 'theme=dark; path=/';
      const router = createMemoryRouter(
        [
          { path: '/', element: <AppShell variant={variant}>Home</AppShell> },
          {
            path: '/settings',
            element: <AppShell variant={variant}>Settings</AppShell>,
          },
        ],
        { initialEntries: ['/settings'] }
      );
      const navigate = vi.spyOn(router, 'navigate');
      renderWithProviders(<RouterProvider router={router} />);

      const homeLink = screen.getByRole('link', { name: 'Sanny64' });
      expect(homeLink).toHaveAttribute('href', '/');
      await user.click(homeLink);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(router.state.location.pathname).toBe('/');
      expect(screen.getByRole('main')).toHaveTextContent('Home');

      await user.click(homeLink);
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    }
  );

  it('keeps buttons keyboard operable and respects the native disabled state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ButtonGroup>
        <Button type="button" onClick={onClick}>
          Save
        </Button>
        <Button type="button" disabled onClick={onClick}>
          Delete
        </Button>
      </ButtonGroup>
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(saveButton).toHaveClass('btn', 'btn--primary');
    expect(deleteButton).toBeDisabled();

    await user.click(saveButton);
    await user.click(deleteButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('associates a checkbox with its label and displays validation feedback', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Receive updates" error="Choose an option" />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Receive updates',
    });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('Choose an option')).toBeVisible();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});

describe('shared UI feedback', () => {
  it('supports toast actions, notification subscriptions, limits, and dismissal', () => {
    let notifications = 0;
    let actionCalls = 0;
    const unsubscribe = subscribeToToasts(() => notifications++);
    const id = showToast('Save your work', {
      kind: 'warning',
      durationMs: 0,
      action: { label: 'Sign in', onClick: () => actionCalls++ },
    });

    expect(getToasts()[0]?.kind).toBe('warning');
    getToasts()[0]?.action?.onClick();
    expect(actionCalls).toBe(1);
    dismissToast(id);
    expect(getToasts()).toHaveLength(0);
    expect(notifications).toBe(2);
    unsubscribe();

    for (let index = 0; index < 6; index++) {
      showToast(`Message ${index}`, { durationMs: 0 });
    }
    expect(getToasts()).toHaveLength(5);
    expect(getToasts()[0]?.message).toBe('Message 1');
  });

  it('expires transient toasts automatically', async () => {
    const id = showToast('Temporary message', { durationMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(getToasts().some((toast) => toast.id === id)).toBe(false);
  });

  it('maps request failures to the correct toast severity', () => {
    const cases = [
      {
        error: new Error('Network failure'),
        message: 'Network failure',
        kind: 'error',
      },
      {
        error: Object.assign(new Error('Please wait'), { status: 429 }),
        message: 'Please wait',
        kind: 'warning',
      },
      { error: null, message: 'Localized fallback', kind: 'error' },
    ];

    for (const { error, message, kind } of cases) {
      const id = showErrorToast(error, 'Localized fallback');
      expect(getToasts()).toHaveLength(1);
      expect(getToasts()[0]?.message).toBe(message);
      expect(getToasts()[0]?.kind).toBe(kind);
      dismissToast(id);
    }
  });

  it('announces errors as alerts and lets users dismiss them', async () => {
    const user = userEvent.setup();
    prepareEnglishLightPreferences();
    renderWithProviders(<ToastViewport />);

    act(() => {
      showErrorToast(new Error('Save failed'), 'Request failed');
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Save failed');

    await user.click(
      within(alert).getByRole('button', { name: 'Dismiss notification' })
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replays the toast motion without adding another alert', () => {
    prepareEnglishLightPreferences();
    renderWithProviders(<ToastViewport />);

    let toastId = 0;
    act(() => {
      toastId = showToast('Backend offline', { durationMs: 0 });
    });
    const alert = screen.getByRole('alert');
    const originalToast = alert.querySelector('.toast');

    act(() => {
      expect(retriggerToast(toastId)).toBe(true);
    });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').querySelector('.toast')).not.toBe(
      originalToast
    );
  });

  it('announces status feedback and invokes its accessible action', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    prepareEnglishLightPreferences();
    renderWithProviders(<ToastViewport />);

    act(() => {
      showToast('Profile saved', {
        kind: 'info',
        durationMs: 0,
        action: { label: 'Undo', onClick: onUndo },
      });
    });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Profile saved');

    await user.click(within(status).getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});

describe('shared settings and error page', () => {
  it('persists theme and language control changes', async () => {
    const user = userEvent.setup();
    prepareEnglishLightPreferences();
    renderWithProviders(<Settings />);

    await user.click(
      screen.getByRole('button', { name: 'Switch to dark mode' })
    );
    expect(screen.getByText('Theme: dark')).toBeVisible();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to German' }));
    expect(screen.getByRole('heading', { name: 'Darstellung' })).toBeVisible();
    expect(screen.getByText('Sprache: de')).toBeVisible();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
    expect(localStorage.getItem('language')).toBe('de');
  });

  it('renders translated not-found content and a home link', () => {
    prepareEnglishLightPreferences();
    const router = createMemoryRouter(
      [{ path: '*', element: <ErrorPage status={404} /> }],
      { initialEntries: ['/missing'] }
    );
    renderWithProviders(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Page Not Found' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/'
    );
  });
});
