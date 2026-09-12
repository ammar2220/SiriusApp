import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserSession {
  userId: string;
  userName: string;
  activeHomeId: string | null;
}

const SESSION_KEY = '@sirius_user_session';

class SessionManager {
  private currentSession: UserSession | null = null;

  async getSession(): Promise<UserSession | null> {
    if (this.currentSession) return this.currentSession;

    try {
      const json = await AsyncStorage.getItem(SESSION_KEY);
      if (json) {
        this.currentSession = JSON.parse(json);
        return this.currentSession;
      }
    } catch (e) {
      console.error('SessionManager: Error loading session', e);
    }
    return null;
  }

  async setSession(session: UserSession): Promise<void> {
    try {
      this.currentSession = session;
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.error('SessionManager: Error saving session', e);
      throw e;
    }
  }

  async clearSession(): Promise<void> {
    try {
      this.currentSession = null;
      await AsyncStorage.removeItem(SESSION_KEY);
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
