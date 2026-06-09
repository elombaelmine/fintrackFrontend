import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { ApiService } from '../../api.service'; // Adjust path if needed
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../notification.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule, FormsModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class Header implements OnInit {
  @Output() menuRequested = new EventEmitter<void>();

  // Start empty so we can see when the stream fills it
  currentUsername: string = ''; 
  profileAvatar: string | null = null;
  searchQuery = '';
  unreadNotifications = 0;

  constructor(
    private apiService: ApiService,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.apiService.currentUser().subscribe(user => {
      if (user && user.username) {
        this.currentUsername = user.username;
        this.profileAvatar = user.profileAvatar || null;
        this.notificationService.refreshBudgetNotifications();
      } else {
        this.currentUsername = '';
        this.profileAvatar = null;
      }
    });

    this.notificationService.unreadCount$.subscribe(count => {
      this.unreadNotifications = count;
    });
  }

  get displayUsername(): string {
    return this.currentUsername.trim() || 'User';
  }

  submitSearch(): void {
    const query = this.searchQuery.trim();

    if (!query) {
      return;
    }

    this.router.navigate(['/history'], {
      queryParams: { q: query }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';

    if (this.router.url.startsWith('/history')) {
      this.router.navigate(['/history']);
    }
  }

  openNotifications(): void {
    this.router.navigate(['/notifications']);
  }

  openMenu(): void {
    this.menuRequested.emit();
  }

  logout(): void {
    this.apiService.logout();
    this.currentUsername = '';
    this.router.navigate(['/auth']);
  }
}
