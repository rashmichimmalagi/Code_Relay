import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { insforge } from "../lib/insforge";
import type { Profile } from "../types";

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  emailVerified?: boolean;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  signOut: () => Promise<void>;
};

const AuthContext =
  createContext<AuthContextValue | null>(
    null,
  );


function isAlreadySignedOutError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "");

  const normalized = message.toLowerCase();

  return (
    normalized.includes("no refresh token provided") ||
    normalized.includes("refresh token") &&
      normalized.includes("not found") ||
    normalized.includes("already signed out") ||
    normalized.includes("session not found")
  );
}


export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  /*
   * Incremented whenever logout starts.
   *
   * This prevents an older getCurrentUser() request from putting the
   * user back into React state after logout has already happened.
   */
  const authOperationRef = useRef(0);

  async function loadProfile(
    currentUser: User,
  ) {
    const result = await insforge.database
      .from("profiles")
      .select("*")
      .eq(
        "user_id",
        currentUser.id,
      )
      .maybeSingle();

    if (result.error) {
      console.error(
        "Unable to load profile:",
        result.error,
      );

      setProfile(null);
      return;
    }

    setProfile(
      (result.data as Profile | null) ??
        null,
    );
  }

  const refreshUser =
    async (): Promise<User | null> => {
      const operation =
        authOperationRef.current;

      const { data, error } =
        await insforge.auth.getCurrentUser();

      /*
       * A logout may have started while this request was in flight.
       * Never restore the old user after that logout.
       */
      if (operation !== authOperationRef.current) {
        return null;
      }

      if (error) {
        setUser(null);
        setProfile(null);
        return null;
      }

      const nextUser =
        (data?.user as User | null) ??
        null;

      setUser(nextUser);

      if (nextUser) {
        await loadProfile(nextUser);
      } else {
        setProfile(null);
      }

      return nextUser;
    };

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    await loadProfile(user);
  };

  useEffect(() => {
    let mounted = true;
    const operation =
      authOperationRef.current;

    async function restoreSession() {
      try {
        const { data, error } =
          await insforge.auth.getCurrentUser();

        if (
          !mounted ||
          operation !== authOperationRef.current
        ) {
          return;
        }

        if (error) {
          setUser(null);
          setProfile(null);
          return;
        }

        const currentUser =
          (data?.user as User | null) ??
          null;

        setUser(currentUser);

        if (!currentUser) {
          setProfile(null);
          return;
        }

        const result =
          await insforge.database
            .from("profiles")
            .select("*")
            .eq(
              "user_id",
              currentUser.id,
            )
            .maybeSingle();

        if (
          !mounted ||
          operation !== authOperationRef.current
        ) {
          return;
        }

        if (result.error) {
          console.error(
            "Unable to load profile:",
            result.error,
          );

          setProfile(null);
          return;
        }

        setProfile(
          (result.data as Profile | null) ??
            null,
        );
      } catch (error) {
        if (
          mounted &&
          operation === authOperationRef.current
        ) {
          console.error(
            "Session restore failed:",
            error,
          );
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      refreshProfile,
      refreshUser,

      signOut: async () => {
        /*
         * Invalidate all in-flight auth reads FIRST.
         * A pending getCurrentUser() must never restore the old user.
         */
        authOperationRef.current += 1;

        /*
         * Clear the UI immediately. The header must switch away from the
         * authenticated state without waiting for the network.
         */
        setUser(null);
        setProfile(null);

        /*
         * Sign out from InsForge in the background. The local session is
         * already cleared, so a slow/hung network request cannot leave the
         * application stuck on "Signing out...".
         */
        void insforge.auth
          .signOut()
          .then((result) => {
            if (result?.error && !isAlreadySignedOutError(result.error)) {
              console.error("Sign out failed:", result.error);
            }
          })
          .catch((error) => {
            if (!isAlreadySignedOutError(error)) {
              console.error("Sign out request failed:", error);
            }
          });
      },
    }),
    [
      user,
      profile,
      loading,
    ],
  );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value =
    useContext(AuthContext);

  if (!value) {
    throw new Error(
      "useAuth must be used within AuthProvider",
    );
  }

  return value;
}
