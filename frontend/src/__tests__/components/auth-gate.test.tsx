import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';

// --- Mock Supabase auth at the module boundary ---

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOtp = vi.fn();

vi.mock('../../lib/supabase', () => ({
  isLocalDev: false,
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: unknown) => mockOnAuthStateChange(callback),
      signInWithOtp: (params: unknown) => mockSignInWithOtp(params),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }),
    }),
  },
}));

// Import after mock setup
import App from '../../App';
import { Login } from '../../components/login';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- Helpers ---

const FAKE_SESSION: Session = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'user-1',
    email: 'jim@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2024-01-01T00:00:00Z',
  },
};

function setupUnauthenticated() {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
}

function setupAuthenticated() {
  mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
}

// --- useAuth behavior via App rendering ---

describe('Auth gate', () => {
  it('shows login when no session exists', async () => {
    setupUnauthenticated();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('HouseOps')).toBeDefined();
    });
    expect(screen.getByPlaceholderText('Email address')).toBeDefined();
    expect(screen.getByText('Send magic link')).toBeDefined();
  });

  it('shows app content when session exists', async () => {
    setupAuthenticated();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('What do you need?')).toBeDefined();
    });
  });

  it('shows loading state before session check completes', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(<App />);

    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('transitions from login to app when auth state changes', async () => {
    let authChangeCallback: ((event: string, session: Session | null) => void) | undefined;

    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: Session | null) => void) => {
      authChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('HouseOps')).toBeDefined();
    });

    // Simulate magic link callback
    authChangeCallback!('SIGNED_IN', FAKE_SESSION);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('What do you need?')).toBeDefined();
    });
  });
});

// --- Login component ---

describe('Login', () => {
  beforeEach(() => {
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('sends magic link on form submit', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();

    render(<Login />);

    await user.type(screen.getByPlaceholderText('Email address'), 'jim@example.com');
    await user.click(screen.getByText('Send magic link'));

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'jim@example.com',
      options: { shouldCreateUser: true },
    });

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeDefined();
    });
    expect(screen.getByText(/jim@example.com/)).toBeDefined();
  });

  it('shows error when magic link fails', async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'User not found' },
    });
    const user = userEvent.setup();

    render(<Login />);

    await user.type(screen.getByPlaceholderText('Email address'), 'unknown@example.com');
    await user.click(screen.getByText('Send magic link'));

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeDefined();
    });
  });

  it('disables input and button while sending', async () => {
    mockSignInWithOtp.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();

    render(<Login />);

    await user.type(screen.getByPlaceholderText('Email address'), 'jim@example.com');
    await user.click(screen.getByText('Send magic link'));

    expect(screen.getByPlaceholderText('Email address')).toHaveProperty('disabled', true);
    expect(screen.getByText('Sending…')).toBeDefined();
  });
});
