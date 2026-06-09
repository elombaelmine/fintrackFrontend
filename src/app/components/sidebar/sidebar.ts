import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router} from '@angular/router';
import { ApiService } from '../../api.service';


@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css'],
  imports: [CommonModule, RouterLink, RouterLinkActive]
})
export class Sidebar implements OnInit {
  @Output() navigated = new EventEmitter<void>();

  currentUsername = '';
  profileAvatar: string | null = null;

  private router = inject(Router);
  private apiService = inject(ApiService);

  ngOnInit(): void {
    this.apiService.currentUser().subscribe(user => {
      if (user) {
        this.currentUsername = user.username || '';
        this.profileAvatar = user.profileAvatar || null;
      } else {
        this.currentUsername = '';
        this.profileAvatar = null;
      }
    });
  }

  onAddTransaction(): void {
    this.router.navigate(['/add-transaction']);
    this.notifyNavigation();
  }

  get displayUsername(): string {
    return this.currentUsername.trim() || 'User';
  }

  notifyNavigation(): void {
    this.navigated.emit();
  }

  logout(): void {
    this.apiService.logout();
    this.router.navigate(['/auth']);
    this.notifyNavigation();
  }

}
