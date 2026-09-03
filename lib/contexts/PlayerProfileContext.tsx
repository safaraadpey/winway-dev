"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { HARD_EXIT_EVENT, isHardExiting } from "@/lib/auth/hardExit";
import {
  clearPlayerProfileShell,
  DEFAULT_PLAYER_PROFILE_SHELL,
  readPlayerProfileShell,
  writePlayerProfileShell,
  type PlayerProfileShell,
} from "@/lib/header/playerProfileShell";

export type PlayerProfile = {
  playerName: string;
  avatarId: string;
  kycVerified: boolean;
  hasHydrated: boolean;
  isRefreshing: boolean;
  refreshProfile: (options?: { force?: boolean }) => Promise<void>;
  invalidateProfile: () => void;
};

const PlayerProfileContext = createContext<PlayerProfile | null>(null);

function shellToState(shell: PlayerProfileShell) {
  return {
    playerName: shell.playerName,
    avatarId: shell.avatarId,
    kycVerified: shell.kycVerified,
  };
}

async function fetchProfileFromServer(): Promise<PlayerProfileShell | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nickname, avatar_url, metadata")
    .eq("user_id", user.id)
    .single();

  const { data: dbUser } = await supabase
    .from("users")
    .select("username, kyc_verified")
    .eq("id", user.id)
    .single();

  let playerName = "کاربر";
  if (profile?.nickname) {
    playerName = profile.nickname;
  } else if (dbUser?.username) {
    playerName = dbUser.username;
  } else if (user.email) {
    playerName = user.email.split("@")[0];
  }

  let avatarId = "001";
  if (profile?.metadata && typeof profile.metadata === "object") {
    const metadata = profile.metadata as { avatar_id?: string | number };
    if (metadata.avatar_id) {
      avatarId = String(metadata.avatar_id).padStart(3, "0");
    }
  } else {
    const { data: oldProfile } = await supabase
      .from("profiles")
      .select("avatar_id")
      .eq("id", user.id)
      .single();

    if (oldProfile?.avatar_id) {
      avatarId = String(oldProfile.avatar_id).padStart(3, "0");
    }
  }

  return {
    playerName,
    avatarId,
    kycVerified: Boolean(dbUser?.kyc_verified),
    fetchedAt: Date.now(),
  };
}

function readInitialProfileState() {
  const cachedShell = readPlayerProfileShell();
  const initial = cachedShell ?? DEFAULT_PLAYER_PROFILE_SHELL;
  return {
    cachedShell,
    playerName: initial.playerName,
    avatarId: initial.avatarId,
    kycVerified: initial.kycVerified,
    hasHydrated: Boolean(cachedShell),
  };
}

export function PlayerProfileProvider({ children }: { children: ReactNode }) {
  const initialRef = useRef(readInitialProfileState());

  const [playerName, setPlayerName] = useState(initialRef.current.playerName);
  const [avatarId, setAvatarId] = useState(initialRef.current.avatarId);
  const [kycVerified, setKycVerified] = useState(initialRef.current.kycVerified);
  const [hasHydrated, setHasHydrated] = useState(initialRef.current.hasHydrated);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isMountedRef = useRef(true);
  const fetchInFlightRef = useRef(false);
  const hasHydratedRef = useRef(initialRef.current.hasHydrated);

  const applyShell = useCallback((shell: PlayerProfileShell) => {
    const next = shellToState(shell);
    setPlayerName(next.playerName);
    setAvatarId(next.avatarId);
    setKycVerified(next.kycVerified);
    writePlayerProfileShell(shell);
    hasHydratedRef.current = true;
    setHasHydrated(true);
  }, []);

  const refreshProfile = useCallback(
    async (options?: { force?: boolean }) => {
      if (isHardExiting()) return;
      if (fetchInFlightRef.current) return;

      fetchInFlightRef.current = true;
      const showSpinner = options?.force === true;
      if (showSpinner) setIsRefreshing(true);

      try {
        console.log("[PlayerProfile] refresh", { force: options?.force ?? false });
        const shell = await fetchProfileFromServer();
        if (!isMountedRef.current || isHardExiting()) return;

        if (shell) {
          applyShell(shell);
        }
      } catch (err) {
        console.warn("[PlayerProfile] refresh failed", err);
      } finally {
        fetchInFlightRef.current = false;
        if (isMountedRef.current) setIsRefreshing(false);
      }
    },
    [applyShell]
  );

  const invalidateProfile = useCallback(() => {
    console.log("[PlayerProfile] invalidate");
    void refreshProfile({ force: true });
  }, [refreshProfile]);

  useEffect(() => {
    isMountedRef.current = true;

    if (initialRef.current.cachedShell) {
      console.log("[PlayerProfile] hydrate from shell");
    } else {
      void refreshProfile();
    }

    const onProfileUpdate = () => invalidateProfile();
    window.addEventListener("profileDisplayNameUpdated", onProfileUpdate);
    window.addEventListener("profileAvatarUpdated", onProfileUpdate);
    window.addEventListener("kycVerifiedUpdated", onProfileUpdate);

    const onHardExit = () => {
      clearPlayerProfileShell();
      hasHydratedRef.current = false;
      setPlayerName(DEFAULT_PLAYER_PROFILE_SHELL.playerName);
      setAvatarId(DEFAULT_PLAYER_PROFILE_SHELL.avatarId);
      setKycVerified(false);
      setHasHydrated(false);
      setIsRefreshing(false);
    };
    window.addEventListener(HARD_EXIT_EVENT, onHardExit);

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!isMountedRef.current || isHardExiting()) return;

      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        void refreshProfile();
      }

      if (event === "SIGNED_OUT") {
        onHardExit();
      }
    });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("profileDisplayNameUpdated", onProfileUpdate);
      window.removeEventListener("profileAvatarUpdated", onProfileUpdate);
      window.removeEventListener("kycVerifiedUpdated", onProfileUpdate);
      window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
      data?.subscription?.unsubscribe();
    };
  }, [invalidateProfile, refreshProfile]);

  const value: PlayerProfile = {
    playerName,
    avatarId,
    kycVerified,
    hasHydrated,
    isRefreshing,
    refreshProfile,
    invalidateProfile,
  };

  return (
    <PlayerProfileContext.Provider value={value}>
      {children}
    </PlayerProfileContext.Provider>
  );
}

export function usePlayerProfile(): PlayerProfile {
  const ctx = useContext(PlayerProfileContext);
  if (!ctx) {
    throw new Error("usePlayerProfile must be used within PlayerProfileProvider");
  }
  return ctx;
}

export function usePlayerProfileOptional(): PlayerProfile | null {
  return useContext(PlayerProfileContext);
}
