import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, of, timeout } from 'rxjs';
import { ApiService } from './api.service';
import { BudgetService } from './budget.service';

export type NotificationSeverity = 'info' | 'warning' | 'danger';

export interface FinTrackNotification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  source: 'budget' | 'category' | 'expense';
  read: boolean;
  createdAt: string;
  monthKey: string;
  category?: string;
}

interface NotificationTransaction {
  date: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly storageKey = 'fintrack_notifications';

  private notificationsSubject = new BehaviorSubject<FinTrackNotification[]>(this.loadNotifications());
  private unreadCountSubject = new BehaviorSubject<number>(this.countUnread(this.notificationsSubject.value));

  notifications$ = this.notificationsSubject.asObservable();
  unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(
    private apiService: ApiService,
    private budgetService: BudgetService
  ) {}

  refreshBudgetNotifications(): void {
    this.apiService.getTransactions().pipe(
      timeout(10000),
      catchError(() => of([]))
    ).subscribe((transactions: any) => {
      this.syncBudgetNotifications((transactions as NotificationTransaction[]) || []);
    });
  }

  syncBudgetNotifications(transactions: NotificationTransaction[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const currentMonthKey = this.getCurrentMonthKey();
    const currentMonthExpenses = transactions.filter(tx => {
      return tx.type === 'expense' && this.isInMonth(tx.date, currentMonthKey);
    });
    const budgetConfig = this.budgetService.getBudgetConfig();
    const budgetLimits = budgetConfig.categoryLimits;
    const totalBudget = budgetConfig.monthlyLimit;
    const totalSpent = currentMonthExpenses.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const alerts: Omit<FinTrackNotification, 'read' | 'createdAt'>[] = [];

    if (totalBudget > 0 && totalSpent > 0) {
      const totalPercent = Math.round((totalSpent / totalBudget) * 100);

      if (totalSpent > totalBudget) {
        alerts.push({
          id: `budget:${currentMonthKey}:overall:over`,
          title: 'Monthly budget exceeded',
          message: `You have spent ${this.formatCurrency(totalSpent)} of your ${this.formatCurrency(totalBudget)} monthly budget.`,
          severity: 'danger',
          source: 'budget',
          monthKey: currentMonthKey
        });
      } else if (totalPercent >= 85) {
        alerts.push({
          id: `budget:${currentMonthKey}:overall:finishing`,
          title: 'Monthly budget is almost finished',
          message: `${totalPercent}% of your monthly budget has been used. Remaining budget: ${this.formatCurrency(totalBudget - totalSpent)}.`,
          severity: 'warning',
          source: 'budget',
          monthKey: currentMonthKey
        });
      }

      const projectedSpending = this.getProjectedSpending(totalSpent);
      if (projectedSpending > totalBudget) {
        alerts.push({
          id: `budget:${currentMonthKey}:overall:pace`,
          title: 'Expense pace is too high',
          message: `At this pace, this month may end around ${this.formatCurrency(projectedSpending)}, above your ${this.formatCurrency(totalBudget)} budget.`,
          severity: 'warning',
          source: 'expense',
          monthKey: currentMonthKey
        });
      }
    }

    const spentByCategory = new Map<string, number>();
    currentMonthExpenses.forEach(tx => {
      const category = tx.category?.trim() || 'Uncategorized';
      spentByCategory.set(category, (spentByCategory.get(category) || 0) + (Number(tx.amount) || 0));
    });

    spentByCategory.forEach((spent, category) => {
      const limit = budgetLimits[category] || 0;
      if (limit <= 0 || spent <= 0) {
        return;
      }

      const percent = Math.round((spent / limit) * 100);
      const categoryId = this.slug(category);

      if (spent > limit) {
        alerts.push({
          id: `budget:${currentMonthKey}:category:${categoryId}:over`,
          title: `${category} is over budget`,
          message: `${category} has used ${this.formatCurrency(spent)} of its ${this.formatCurrency(limit)} limit.`,
          severity: 'danger',
          source: 'category',
          monthKey: currentMonthKey,
          category
        });
      } else if (percent >= 85) {
        alerts.push({
          id: `budget:${currentMonthKey}:category:${categoryId}:finishing`,
          title: `${category} budget is almost finished`,
          message: `${category} has used ${percent}% of its budget. Remaining: ${this.formatCurrency(limit - spent)}.`,
          severity: 'warning',
          source: 'category',
          monthKey: currentMonthKey,
          category
        });
      }
    });

    this.mergeAlerts(alerts);
  }

  markAsRead(id: string): void {
    this.updateNotifications(
      this.notificationsSubject.value.map(notification => {
        return notification.id === id ? { ...notification, read: true } : notification;
      })
    );
  }

  markAllAsRead(): void {
    this.updateNotifications(
      this.notificationsSubject.value.map(notification => ({ ...notification, read: true }))
    );
  }

  clearNotifications(): void {
    this.updateNotifications([]);
  }

  private mergeAlerts(alerts: Omit<FinTrackNotification, 'read' | 'createdAt'>[]): void {
    if (alerts.length === 0) {
      return;
    }

    const existingById = new Map(this.notificationsSubject.value.map(notification => [notification.id, notification]));
    const now = new Date().toISOString();

    alerts.forEach(alert => {
      const existing = existingById.get(alert.id);
      existingById.set(alert.id, {
        ...alert,
        read: existing?.read ?? false,
        createdAt: existing?.createdAt ?? now
      });
    });

    const nextNotifications = Array.from(existingById.values())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    this.updateNotifications(nextNotifications);
  }

  private updateNotifications(notifications: FinTrackNotification[]): void {
    this.notificationsSubject.next(notifications);
    this.unreadCountSubject.next(this.countUnread(notifications));
    this.persistNotifications(notifications);
  }

  private loadNotifications(): FinTrackNotification[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const storedNotifications = localStorage.getItem(this.storageKey);
      return storedNotifications ? JSON.parse(storedNotifications) as FinTrackNotification[] : [];
    } catch {
      return [];
    }
  }

  private persistNotifications(notifications: FinTrackNotification[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.storageKey, JSON.stringify(notifications));
  }

  private countUnread(notifications: FinTrackNotification[]): number {
    return notifications.filter(notification => !notification.read).length;
  }

  private getProjectedSpending(totalSpent: number): number {
    const today = new Date();
    const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = Math.max(1, today.getDate());
    return (totalSpent / dayOfMonth) * totalDays;
  }

  private getCurrentMonthKey(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  private isInMonth(dateValue: string, monthKey: string): boolean {
    return dateValue.slice(0, 7) === monthKey;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0
    }).format(amount);
  }

  private slug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'uncategorized';
  }
}
