import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../notification.service';
import { BudgetService } from '../../budget.service';

interface Transaction {
  date: string;
  description: string;
  category: string;
  status?: string;
  amount: number;
  type: 'income' | 'expense';
}

interface BudgetCategory {
  name: string;
  spent: number;
  credited: number;
  available: number;
  limit: number;
  percentage: number;
  rawPercentage: number;
  remaining: number;
  status: 'On Track' | 'Warning' | 'Over Budget';
}

interface SavingsGoal {
  title: string;
  target: number;
  saved: number;
  deadline: string;
  monthlyContribution: number;
  draftContribution: number;
}

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget.html',
  styleUrls: ['./budget.css']
})
export class Budget implements OnInit {
  private readonly goalsStorageKey = 'fintrack_savings_goals';

  private allTransactions: Transaction[] = [];
  private budgetLimits: Record<string, number> = {};

  selectedMonth = '';
  selectedMonthTransactions: Transaction[] = [];
  categoryBudgets: BudgetCategory[] = [];
  savingsGoals: SavingsGoal[] = [];

  totalMonthlyBudget = 0;
  monthlyBudgetLimit = 0;
  draftMonthlyBudgetLimit: number | null = null;
  allocatedBudgetTotal = 0;
  unallocatedBudget = 0;
  totalSpent = 0;
  totalRemaining = 0;
  daysLeft = 0;
  dailyAverage = 0;
  projectedSpending = 0;

  isLoadingBudgets = false;
  budgetError = '';
  goalError = '';
  newCategoryName = '';
  newCategoryLimit: number | null = null;
  newGoalTitle = '';
  newGoalTarget: number | null = null;
  newGoalDeadline = '';
  newGoalMonthlyContribution: number | null = null;

  constructor(
    private apiService: ApiService,
    private notificationService: NotificationService,
    private budgetService: BudgetService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setCurrentMonth();
      this.loadSavedBudgetConfig();
      this.loadSavedGoals();
      this.loadBudgetData();
    }
  }

  loadBudgetData(): void {
    if (this.isLoadingBudgets) {
      return;
    }

    this.isLoadingBudgets = true;
    this.budgetError = '';

    this.apiService.getTransactions().pipe(
      timeout(10000),
      finalize(() => {
        this.isLoadingBudgets = false;
        this.refreshView();
      })
    ).subscribe({
      next: (data: Transaction[]) => {
        this.allTransactions = data || [];
        this.applyMonthFilter();
      },
      error: (err) => {
        console.error('Budget sync error:', err);
        this.budgetError = this.getBudgetErrorMessage(err);
        this.applyMonthFilter();
      }
    });
  }

  applyMonthFilter(): void {
    this.selectedMonthTransactions = this.allTransactions.filter(tx => this.isInSelectedMonth(tx.date));
    this.recalculateBudgets();
    this.refreshView();
  }

  changeMonth(offset: number): void {
    const selectedDate = this.getSelectedMonthDate();
    selectedDate.setMonth(selectedDate.getMonth() + offset);
    this.selectedMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
    this.applyMonthFilter();
  }

  saveCategoryLimit(category: BudgetCategory): void {
    const cleanLimit = Math.max(0, Number(category.limit) || 0);
    const previousLimit = this.budgetLimits[category.name] || 0;
    const nextLimits = {
      ...this.budgetLimits,
      [category.name]: cleanLimit
    };

    if (!this.canSaveCategoryLimits(nextLimits)) {
      category.limit = previousLimit;
      this.refreshView();
      return;
    }

    this.budgetLimits = nextLimits;
    this.persistBudgetLimits();
    this.budgetError = '';
    this.recalculateBudgets();
  }

  saveMonthlyBudgetLimit(): void {
    const cleanLimit = Math.max(0, Number(this.draftMonthlyBudgetLimit) || 0);

    if (cleanLimit <= 0) {
      this.budgetError = 'Enter a monthly budget limit greater than zero.';
      this.refreshView();
      return;
    }

    if (cleanLimit < this.allocatedBudgetTotal) {
      this.budgetError = `Your category budgets already total ${this.formatCurrency(this.allocatedBudgetTotal)}. Set a monthly limit at least that high, or reduce some category limits first.`;
      this.draftMonthlyBudgetLimit = this.monthlyBudgetLimit;
      this.refreshView();
      return;
    }

    this.monthlyBudgetLimit = cleanLimit;
    this.totalMonthlyBudget = cleanLimit;
    this.budgetService.saveMonthlyBudgetLimit(cleanLimit);
    this.budgetError = '';
    this.recalculateBudgets();
  }

  addCategory(): void {
    const name = this.newCategoryName.trim();
    const limit = Math.max(0, Number(this.newCategoryLimit) || 0);

    if (!name || limit <= 0) {
      this.budgetError = 'Enter a category name and a monthly limit greater than zero.';
      this.refreshView();
      return;
    }

    const nextLimits = {
      ...this.budgetLimits,
      [name]: limit
    };

    if (!this.canSaveCategoryLimits(nextLimits)) {
      this.refreshView();
      return;
    }

    this.budgetLimits = nextLimits;
    this.persistBudgetLimits();
    this.newCategoryName = '';
    this.newCategoryLimit = null;
    this.budgetError = '';
    this.recalculateBudgets();
  }

  addGoalFunds(goal: SavingsGoal): void {
    const contribution = Math.max(0, Number(goal.draftContribution) || 0);

    if (contribution <= 0) {
      return;
    }

    goal.saved = Math.min(goal.target, goal.saved + contribution);
    goal.draftContribution = 0;
    this.goalError = '';
    this.persistGoals();
    this.refreshView();
  }

  addSavingsGoal(): void {
    const title = this.newGoalTitle.trim();
    const target = Math.max(0, Number(this.newGoalTarget) || 0);
    const monthlyContribution = Math.max(0, Number(this.newGoalMonthlyContribution) || 0);

    if (!title || target <= 0) {
      this.goalError = 'Enter a goal name and a target amount greater than zero.';
      this.refreshView();
      return;
    }

    this.savingsGoals = [
      ...this.savingsGoals,
      {
        title,
        target,
        saved: 0,
        deadline: this.newGoalDeadline.trim() || 'Flexible',
        monthlyContribution,
        draftContribution: 0
      }
    ];

    this.newGoalTitle = '';
    this.newGoalTarget = null;
    this.newGoalDeadline = '';
    this.newGoalMonthlyContribution = null;
    this.goalError = '';
    this.persistGoals();
    this.refreshView();
  }

  removeSavingsGoal(index: number): void {
    this.savingsGoals = this.savingsGoals.filter((_, goalIndex) => goalIndex !== index);
    this.goalError = '';
    this.persistGoals();
    this.refreshView();
  }

  exportBudgetCsv(): void {
    if (!isPlatformBrowser(this.platformId) || this.categoryBudgets.length === 0) {
      return;
    }

    const rows = [
      ['Month', 'Category', 'Budget Limit', 'Spent', 'Remaining', 'Used Percent', 'Status'],
      ...this.categoryBudgets.map(category => [
        this.selectedMonthLabel,
        category.name,
        String(category.limit),
        String(category.spent),
        String(category.remaining),
        String(category.rawPercentage),
        category.status
      ])
    ];

    const csv = rows
      .map(row => row.map(value => this.escapeCsv(value)).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fintrack-budget-${this.selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  get selectedMonthLabel(): string {
    return this.getSelectedMonthDate().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  get budgetUsedPercent(): number {
    if (this.totalMonthlyBudget <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((this.totalSpent / this.totalMonthlyBudget) * 100));
  }

  get budgetStatusLabel(): string {
    if (this.totalSpent > this.totalMonthlyBudget && this.totalMonthlyBudget > 0) {
      return 'Over budget';
    }

    if (this.budgetUsedPercent >= 80) {
      return 'Watch closely';
    }

    return 'On track';
  }

  get budgetStatusClass(): string {
    if (this.totalSpent > this.totalMonthlyBudget && this.totalMonthlyBudget > 0) {
      return 'over-budget';
    }

    if (this.budgetUsedPercent >= 80) {
      return 'warning';
    }

    return 'on-track';
  }

  goalProgress(goal: SavingsGoal): number {
    if (goal.target <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((goal.saved / goal.target) * 100));
  }

  goalRemaining(goal: SavingsGoal): number {
    return Math.max(0, goal.target - goal.saved);
  }

  private recalculateBudgets(): void {
    const expenses = this.selectedMonthTransactions.filter(tx => tx.type === 'expense');
    const creditedByCategory = new Map<string, number>();
    const spentByCategory = new Map<string, number>();

    this.selectedMonthTransactions
      .filter(tx => tx.type === 'income')
      .forEach(tx => {
        const amount = Number(tx.amount) || 0;
        const category = tx.category?.trim() || '';

        if (category && this.budgetLimits[category] !== undefined) {
          creditedByCategory.set(category, (creditedByCategory.get(category) || 0) + amount);
        }
      });

    expenses.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      const category = tx.category?.trim() || 'Uncategorized';
      spentByCategory.set(category, (spentByCategory.get(category) || 0) + amount);

      if (this.budgetLimits[category] === undefined) {
        this.budgetLimits[category] = 0;
      }
    });

    const categoryNames = Array.from(new Set([
      ...Object.keys(this.budgetLimits),
      ...Array.from(spentByCategory.keys()),
      ...Array.from(creditedByCategory.keys())
    ])).sort((a, b) => a.localeCompare(b));

    this.categoryBudgets = categoryNames.map(name => {
      const spent = spentByCategory.get(name) || 0;
      const credited = creditedByCategory.get(name) || 0;
      const limit = this.budgetLimits[name] ?? 0;
      const available = limit + credited;
      const rawPercentage = available > 0 ? Math.round((spent / available) * 100) : spent > 0 ? 100 : 0;
      const status = this.getCategoryStatus(rawPercentage, spent, available);

      return {
        name,
        spent,
        credited,
        available,
        limit,
        rawPercentage,
        percentage: Math.min(100, rawPercentage),
        remaining: available - spent,
        status
      };
    });

    this.allocatedBudgetTotal = this.budgetService.getCategoryLimitTotal(this.budgetLimits);
    this.totalMonthlyBudget = this.monthlyBudgetLimit;
    this.totalSpent = expenses.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    this.totalRemaining = this.totalMonthlyBudget - this.totalSpent;
    this.unallocatedBudget = this.totalMonthlyBudget - this.allocatedBudgetTotal;
    this.updateCalendarMetrics();
    this.notificationService.syncBudgetNotifications(this.allTransactions);
  }

  private updateCalendarMetrics(): void {
    const selectedDate = this.getSelectedMonthDate();
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const daysPassed = isCurrentMonth ? today.getDate() : totalDays;

    this.daysLeft = isCurrentMonth ? Math.max(0, totalDays - today.getDate()) : 0;
    this.dailyAverage = this.totalSpent / Math.max(1, daysPassed);
    this.projectedSpending = this.dailyAverage * totalDays;
  }

  private getCategoryStatus(rawPercentage: number, spent: number, limit: number): BudgetCategory['status'] {
    if ((limit > 0 && spent > limit) || rawPercentage >= 100) {
      return 'Over Budget';
    }

    if (rawPercentage >= 80) {
      return 'Warning';
    }

    return 'On Track';
  }

  private loadSavedBudgetConfig(): void {
    const config = this.budgetService.getBudgetConfig();
    this.budgetLimits = config.categoryLimits;
    this.monthlyBudgetLimit = config.monthlyLimit;
    this.draftMonthlyBudgetLimit = config.monthlyLimit;
    this.allocatedBudgetTotal = this.budgetService.getCategoryLimitTotal(this.budgetLimits);
    this.totalMonthlyBudget = config.monthlyLimit;
  }

  private persistBudgetLimits(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.budgetService.saveCategoryLimits(this.budgetLimits);
  }

  private canSaveCategoryLimits(nextLimits: Record<string, number>): boolean {
    const allocatedTotal = this.budgetService.getCategoryLimitTotal(nextLimits);

    if (allocatedTotal > this.monthlyBudgetLimit) {
      this.budgetError = `Category budgets cannot exceed your monthly limit. You have ${this.formatCurrency(Math.max(0, this.monthlyBudgetLimit - this.allocatedBudgetTotal))} left to allocate.`;
      return false;
    }

    return true;
  }

  private loadSavedGoals(): void {
    const fallbackGoals: SavingsGoal[] = [
      {
        title: 'Emergency Fund',
        target: 1000000,
        saved: 250000,
        deadline: 'Flexible',
        monthlyContribution: 100000,
        draftContribution: 0
      },
      {
        title: 'School Fees Reserve',
        target: 500000,
        saved: 125000,
        deadline: 'Next term',
        monthlyContribution: 75000,
        draftContribution: 0
      }
    ];

    try {
      const savedGoals = localStorage.getItem(this.goalsStorageKey);
      const parsedGoals: Array<Partial<SavingsGoal> & { suggestedMonthly?: number }> = savedGoals
        ? JSON.parse(savedGoals) as Array<Partial<SavingsGoal> & { suggestedMonthly?: number }>
        : fallbackGoals;

      this.savingsGoals = parsedGoals.map(goal => {
        const target = Math.max(0, Number(goal.target) || 0);
        const saved = Math.max(0, Number(goal.saved) || 0);

        return {
          title: goal.title?.trim() || 'Savings Goal',
          target,
          saved: target > 0 ? Math.min(target, saved) : saved,
          deadline: goal.deadline?.trim() || 'Flexible',
          monthlyContribution: Math.max(0, Number(goal.monthlyContribution ?? goal.suggestedMonthly) || 0),
          draftContribution: 0
        };
      });
    } catch {
      this.savingsGoals = fallbackGoals;
    }
  }

  private persistGoals(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    localStorage.setItem(this.goalsStorageKey, JSON.stringify(this.savingsGoals));
  }

  private setCurrentMonth(): void {
    const today = new Date();
    this.selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  private isInSelectedMonth(dateValue: string): boolean {
    const txDate = this.parseTransactionDate(dateValue);
    const selectedDate = this.getSelectedMonthDate();
    return txDate.getFullYear() === selectedDate.getFullYear() &&
      txDate.getMonth() === selectedDate.getMonth();
  }

  private parseTransactionDate(dateValue: string): Date {
    const [year = 1970, month = 1, day = 1] = dateValue.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private getSelectedMonthDate(): Date {
    if (!this.selectedMonth) {
      return new Date();
    }

    const [year = new Date().getFullYear(), month = new Date().getMonth() + 1] = this.selectedMonth.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  private escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0
    }).format(amount);
  }

  private getBudgetErrorMessage(err: any): string {
    if (err?.name === 'TimeoutError') {
      return 'This is taking longer than expected. Try refreshing again.';
    }

    if (err?.status === 0) {
      return 'We cannot connect right now. The server may be down or still starting.';
    }

    return err?.error?.message || 'Could not load budget data right now.';
  }

  private refreshView(): void {
    setTimeout(() => {
      try {
        this.cdr.detectChanges();
      } catch {
        // Component may have been destroyed during navigation.
      }
    });
  }
}
