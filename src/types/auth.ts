export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface UserSession {
  activeUserId: string;
  activeHomeId: string | null;
}
