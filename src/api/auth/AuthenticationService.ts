import { supabase } from '../cloud/supabaseClient';
import SessionManager from '../session/SessionManager';
import ProfileService from '../services/ProfileService';

class AuthenticationService {
  async signUp(email: string, displayName: string, password: string): Promise<{ success: boolean, needsConfirmation?: boolean, error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Immediately sync profile to avoid race conditions during home creation
        const profile = await ProfileService.syncProfile();
        const userName = profile?.display_name || displayName || 'Sirius User';

        // If email confirmation is enabled, the user might not be fully signed in yet
        const needsConfirmation = data.session === null;

        await SessionManager.setSession({
          activeUserId: data.user.id,
          activeHomeId: null,
          userName: userName,
        });

        return { success: true, needsConfirmation };
      }

      return { success: true };
    } catch (e: any) {
      console.error('AuthenticationService: signUp failed', e);
      return { success: false, error: e.message || 'An unexpected error occurred during sign-up.' };
    }
  }

  async signIn(email: string, password: string): Promise<{ success: boolean, error?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const profile = await ProfileService.syncProfile();
        const userName = profile?.display_name || 'Sirius User';

        await SessionManager.setSession({
          activeUserId: data.user.id,
          activeHomeId: null,
          userName: userName,
        });
      }

      return { success: true };
    } catch (e: any) {
      console.error('AuthenticationService: signIn failed', e);
      return { success: false, error: e.message || 'An unexpected error occurred during sign-in.' };
    }
  }

  async signOut(): Promise<void> {
    await SessionManager.clearSession();
  }

  async getCurrentSession() {
    return SessionManager.getSession();
  }

  async validateCurrentSession(): Promise<boolean> {
    const session = await SessionManager.getSession();
    return !!session;
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean, error?: string }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.error('AuthenticationService: requestPasswordReset failed', e);
      return { success: false, error: e.message || 'An unexpected error occurred.' };
    }
  }
}

export default new AuthenticationService();