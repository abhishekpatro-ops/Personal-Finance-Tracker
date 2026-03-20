import { create } from "zustand";

const ACCESS_TOKEN_KEY = "pft_access_token";
const REFRESH_TOKEN_KEY = "pft_refresh_token";
const DISPLAY_NAME_KEY = "pft_display_name";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  displayName: string | null;
  setTokens: (accessToken: string, refreshToken: string, displayName?: string | null) => void;
  clearTokens: () => void;
};

const initialAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
const initialRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
const initialDisplayName = localStorage.getItem(DISPLAY_NAME_KEY);

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: initialAccessToken,
  refreshToken: initialRefreshToken,
  displayName: initialDisplayName,
  setTokens: (accessToken: string, refreshToken: string, displayName?: string | null) => {
    const cleanDisplayName = displayName?.trim() || null;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

    if (cleanDisplayName) {
      localStorage.setItem(DISPLAY_NAME_KEY, cleanDisplayName);
    } else {
      localStorage.removeItem(DISPLAY_NAME_KEY);
    }

    set({ accessToken, refreshToken, displayName: cleanDisplayName });
  },
  clearTokens: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
    set({ accessToken: null, refreshToken: null, displayName: null });
  }
}));
