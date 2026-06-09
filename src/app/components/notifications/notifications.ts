import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FinTrackNotification, NotificationService } from '../../notification.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.html',
  styleUrls: ['./notifications.css']
})
export class Notifications implements OnInit {
  notifications: FinTrackNotification[] = [];
  unreadCount = 0;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.notificationService.notifications$.subscribe(notifications => {
      this.notifications = notifications;
    });

    this.notificationService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });

    this.notificationService.refreshBudgetNotifications();
  }

  markAsRead(notification: FinTrackNotification): void {
    this.notificationService.markAsRead(notification.id);
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  clearAll(): void {
    this.notificationService.clearNotifications();
  }

  severityIcon(notification: FinTrackNotification): string {
    if (notification.severity === 'danger') {
      return 'priority_high';
    }

    if (notification.severity === 'warning') {
      return 'warning';
    }

    return 'info';
  }
}
