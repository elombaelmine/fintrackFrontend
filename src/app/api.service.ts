import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';

export interface FinTrackUser {
  id?: number;
  username: string;
  email: string;
  profileAvatar?: string | null;
}

declare global {
  interface Window {
    finTrackConfig?: {
      apiBaseUrl?: string;
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = this.resolveApiUrl();
  private currentUserSubject = new BehaviorSubject<FinTrackUser | null>(this.getStoredUser());

  constructor(private http: HttpClient) {}

  registerUser(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, payload);
  }

  loginUser(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, payload);
  }

  setCurrentUser(user: FinTrackUser | null) {
    this.currentUserSubject.next(user);

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      if (user) {
        localStorage.setItem('fintrack_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('fintrack_user');
      }
    }
  }

  logout(): void {
    this.currentUserSubject.next(null);

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem('fintrack_token');
      localStorage.removeItem('fintrack_user');
    }
  }

  private getToken(): string | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }

    return localStorage.getItem('fintrack_token');
  }

  private authOptions() {
    const token = this.getToken();
    return {
      headers: new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  getTransactions(): Observable<any> {
    if (!this.getToken()) {
      return of([]);
    }

    return this.http.get(`${this.apiUrl}/transactions`, this.authOptions());
  }

  createTransaction(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/transactions`, payload, this.authOptions());
  }

  updateProfile(payload: { email: string; profileAvatar?: string | null }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/auth/profile`, payload, this.authOptions()).pipe(
      tap((response: any) => {
        if (response?.user) {
          this.setCurrentUser(response.user);
        }
      })
    );
  }

  updatePassword(payload: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/auth/password`, payload, this.authOptions());
  }

  currentUser():Observable<FinTrackUser | null>{
    const cachedUser = this.currentUserSubject.value;

    if (!cachedUser && this.getToken()) {
      this.http.get<FinTrackUser>(`${this.apiUrl}/auth/me`, this.authOptions()).pipe(
        tap((user) => this.setCurrentUser(user)),
        catchError(() => {
          this.setCurrentUser(null);
          return of(null);
        })
      ).subscribe();
    }

    return this.currentUserSubject.asObservable();
  }

  get currentUserValue(): FinTrackUser | null {
    return this.currentUserSubject.value;
  }

  private getStoredUser(): FinTrackUser | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const storedUser = localStorage.getItem('fintrack_user');
      return storedUser ? JSON.parse(storedUser) as FinTrackUser : null;
    } catch {
      return null;
    }
  }

  private resolveApiUrl(): string {
    // Hardcode the production URL so it never fails or defaults to the frontend domain
    return 'https://fintrackbackend-xtg8.onrender.com/api';
  }

  //   const configuredUrl = window.finTrackConfig?.apiBaseUrl?.trim();
  //   if (configuredUrl) {
  //     return configuredUrl.replace(/\/+$/, '');
  //   }

  //   if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  //     return 'http://localhost:3000/api';
  //   }

  //   return `${window.location.origin}/api`;
  // }
}
