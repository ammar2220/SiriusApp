import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../cloud/supabaseClient';
import ProfileService from '../services/ProfileService';
import { Alert } from 'react-native';

export interface UserSession {
  activeUserId: string;
  activeHomeId: string | null;
  userName: string;
}

const HOME_ID_KEY = '@sirius_active_home_id';

class SessionManager {
  private currentSession: UserSession | null = null;

  async getSession(): Promise<UserSession | null> {
    // 1. Get the actual auth session from Supabase
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      this.currentSession = null;
      return null;
    }

    // Sync profile to Supabase profiles table and get the most recent data
    let profileDisplayName = 'Sirius User';
    try {
      const profile = await ProfileService.syncProfile();
      console.log('[SessionManager] syncProfile result:', { profile });
      if (profile) {
        profileDisplayName = profile.display_name || 'Sirius User';
      }
    } catch (e) {
      console.warn('[SessionManager] Profile sync failed, using metadata fallback:', e);
    }

    // 2. Retrieve the activeHomeId from local storage
    let activeHomeId: string | null = null;
    try {
      activeHomeId = await AsyncStorage.getItem(HOME_ID_KEY);
    } catch (e) {
      console.error('SessionManager: Error loading activeHomeId', e);
    }

    this.currentSession = {
      activeUserId: session.user.id,
      activeHomeId: activeHomeId,
      userName: profileDisplayName,
    };

    return this.currentSession;
  }

  async setSession(session: UserSession): Promise<void> {
    try {
      this.currentSession = session;
      // We only persist activeHomeId because Supabase manages the auth session
      if (session.activeHomeId) {
        await AsyncStorage.setItem(HOME_ID_KEY, session.activeHomeId);
      } else {
        await AsyncStorage.removeItem(HOME_ID_KEY);
      }
    } catch (e) {
      console.error('SessionManager: Error saving session', e);
      throw e;
    }
  }

  async clearSession(): Promise<void> {
    try {
      this.currentSession = null;
      await AsyncStorage.removeItem(HOME_ID_KEY);
      await supabase.auth.signOut();
    } catch (e) {
      console.error('SessionManager: Error clearing session', e);
      throw e;
    }
  }

  async setActiveHome(homeId: string | null): Promise<void> {
    const session = await this.getSession();
    if (session) {
      const updated = { ...session, activeHomeId: homeId };
      await this.setSession(updated);
    }
  }
}

export default new SessionManager();
