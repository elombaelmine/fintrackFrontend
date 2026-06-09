import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { ApiService, FinTrackUser } from '../../api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  username = 'User';
  email = '';
  profileAvatar: string | null = null;

  profileMessage = '';
  profileError = '';
  passwordMessage = '';
  passwordError = '';
  avatarError = '';

  isSavingProfile = false;
  isChangingPassword = false;

  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  constructor(
    private apiService: ApiService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.apiService.currentUser().subscribe({
      next: (user) => this.applyUser(user)
    });
  }

  get avatarInitial(): string {
    return this.username.charAt(0).toUpperCase() || 'U';
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.avatarError = 'Choose a valid image file.';
      input.value = '';
      return;
    }

    if (file.size > 1.5 * 1024 * 1024) {
      this.avatarError = 'Use an image smaller than 1.5 MB.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.profileAvatar = String(reader.result);
      this.avatarError = '';
      this.profileMessage = '';
      this.syncCurrentUserPreview();
      this.refreshView();
    };
    reader.readAsDataURL(file);
  }

  removeAvatar(): void {
    this.profileAvatar = null;
    this.avatarError = '';
    this.profileMessage = '';
    this.syncCurrentUserPreview();
    this.refreshView();
  }

  saveProfile(): void {
    if (this.isSavingProfile) {
      return;
    }

    this.profileError = '';
    this.profileMessage = '';

    if (!this.email.trim()) {
      this.profileError = 'Email is required.';
      return;
    }

    this.isSavingProfile = true;
    this.apiService.updateProfile({
      email: this.email.trim(),
      profileAvatar: this.profileAvatar
    }).pipe(
      timeout(10000),
      finalize(() => {
        this.isSavingProfile = false;
        this.refreshView();
      })
    ).subscribe({
      next: (response) => {
        this.applyUser(response.user);
        this.profileMessage = 'Profile updated successfully.';
        this.refreshView();
      },
      error: (err) => {
        this.profileError = this.getErrorMessage(err, 'Could not update profile.');
        this.refreshView();
      }
    });
  }

  changePassword(): void {
    if (this.isChangingPassword) {
      return;
    }

    this.passwordError = '';
    this.passwordMessage = '';

    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword) {
      this.passwordError = 'Current password and new password are required.';
      return;
    }

    if (this.passwordForm.newPassword.length < 6) {
      this.passwordError = 'New password must be at least 6 characters.';
      return;
    }

    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.passwordError = 'New password and confirmation do not match.';
      return;
    }

    this.isChangingPassword = true;
    this.apiService.updatePassword({
      currentPassword: this.passwordForm.currentPassword,
      newPassword: this.passwordForm.newPassword
    }).pipe(
      timeout(10000),
      finalize(() => {
        this.isChangingPassword = false;
        this.refreshView();
      })
    ).subscribe({
      next: () => {
        this.passwordMessage = 'Password changed successfully.';
        this.passwordForm = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        };
        this.refreshView();
      },
      error: (err) => {
        this.passwordError = this.getErrorMessage(err, 'Could not change password.');
        this.refreshView();
      }
    });
  }

  private applyUser(user: FinTrackUser | null | undefined): void {
    if (!user) {
      return;
    }

    this.username = user.username || 'User';
    this.email = user.email || '';
    this.profileAvatar = user.profileAvatar || null;
  }

  private syncCurrentUserPreview(): void {
    const currentUser = this.apiService.currentUserValue;

    this.apiService.setCurrentUser({
      id: currentUser?.id,
      username: currentUser?.username || this.username || 'User',
      email: this.email.trim() || currentUser?.email || '',
      profileAvatar: this.profileAvatar
    });
  }

  private getErrorMessage(err: any, fallback: string): string {
    if (err?.name === 'TimeoutError') {
      return 'This is taking longer than expected. Please try again.';
    }

    if (err?.status === 0) {
      return 'We cannot connect right now. The server may be down or still starting.';
    }

    return err?.error?.message || err?.error?.error || fallback;
  }

  private refreshView(): void {
    setTimeout(() => {
      try {
        this.cdr.detectChanges();
      } catch {
        // The component may have been destroyed during navigation.
      }
    });
  }
}
