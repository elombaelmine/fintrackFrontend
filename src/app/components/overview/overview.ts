import { ChangeDetectorRef, Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { finalize, timeout } from 'rxjs';
import { BudgetService } from '../../budget.service';

interface Transaction {
  description: string;
  category: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  status?: string;
}

interface CategorySummary {
  name: string;
  amount: number;
  percentage: number;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './overview.html',
  styleUrls: ['./overview.css']
})
export class Overview implements OnInit {
  username: string = 'Operator';
  totalBalance: number = 0;
  totalIncome: number = 0;
  
  // Budget & Financial Metrics
  monthlyBudgetLimit: number = 0;
  totalSpent: number = 0;
  
  // Calendar-Aware Variables
  daysLeft: number = 1;
  daysPassedInMonth: number = 1;
  totalDaysInCurrentMonth: number = 30;

  selectedMonth: string = '';
  allTransactions: Transaction[] = [];
  transactions: Transaction[] = [];
  categoryBreakdown: CategorySummary[] = [];
  isLoadingLedger = false;
  ledgerError = '';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private apiService: ApiService,
    private budgetService: BudgetService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setCurrentMonth();
      this.loadCurrentOperator();
      this.refreshDashboardLedger();
    }
  }

  private setCurrentMonth(): void {
    const today = new Date();
    this.selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  private loadCurrentOperator(): void {
    // Listens to the live stream from ApiService
    this.apiService.currentUser().subscribe({
      next: (user) => {
        if (user && user.username) {
          this.username = user.username.charAt(0).toUpperCase() + user.username.slice(1);
        }
      }
    });
  }

  refreshDashboardLedger(): void {
    if (this.isLoadingLedger) {
      return;
    }

    this.isLoadingLedger = true;
    this.ledgerError = '';

    this.apiService.getTransactions().pipe(
      timeout(10000),
      finalize(() => {
        this.isLoadingLedger = false;
        this.refreshView();
      })
    ).subscribe({
      next: (data: Transaction[]) => {
        this.allTransactions = data || [];
        this.applyMonthFilter();
      },
      error: (err) => {
        console.error('Ledger sync error:', err);
        this.ledgerError = this.getLedgerErrorMessage(err);
        this.applyMonthFilter();
      }
    });
  }

  applyMonthFilter(): void {
    this.transactions = this.allTransactions.filter(tx => this.isInSelectedMonth(tx.date));
    this.runFinancialEngine();
    this.refreshView();
  }

  changeMonth(offset: number): void {
    const selectedDate = this.getSelectedMonthDate();
    selectedDate.setMonth(selectedDate.getMonth() + offset);
    this.selectedMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
    this.applyMonthFilter();
  }

  private runFinancialEngine(): void {
    this.monthlyBudgetLimit = this.budgetService.getBudgetConfig().monthlyLimit;

    const selectedDate = this.getSelectedMonthDate();
    const currentYear = selectedDate.getFullYear();
    const currentMonth = selectedDate.getMonth();
    const today = new Date();
    const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();

    // 1. Calculate precise calendar days
    this.totalDaysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    this.daysPassedInMonth = isCurrentMonth ? today.getDate() : this.totalDaysInCurrentMonth;
    this.daysLeft = isCurrentMonth ? Math.max(0, this.totalDaysInCurrentMonth - this.daysPassedInMonth) : 0;
    
    let income = 0;
    let expenses = 0;
    const categories = new Map<string, number>();

    this.transactions.forEach(tx => {
      const amount = Number(tx.amount);
      if (tx.type === 'income') {
        income += amount;
      } else {
        expenses += amount;
        categories.set(tx.category, (categories.get(tx.category) || 0) + amount);
      }
    });

    this.totalIncome = income;
    this.totalBalance = income - expenses;
    this.totalSpent = expenses;
    this.categoryBreakdown = Array.from(categories.entries())
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: expenses > 0 ? Math.round((amount / expenses) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  // Calculated Getters for Template Binding
  get dailyAverage(): number {
    return this.totalSpent / Math.max(1, this.daysPassedInMonth);
  }

  get projectedSpending(): number {
    return this.dailyAverage * this.totalDaysInCurrentMonth;
  }

  get selectedMonthLabel(): string {
    return this.getSelectedMonthDate().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  get remainingBudget(): number {
    return this.monthlyBudgetLimit - this.totalSpent;
  }

  get savingsRate(): number {
    if (this.totalIncome <= 0) {
      return 0;
    }

    return Math.round((this.totalBalance / this.totalIncome) * 100);
  }

  get displayedTransactions(): Transaction[] {
    return this.transactions.slice(0, 8);
  }

  get budgetUsedPercent(): number {
    if (this.monthlyBudgetLimit <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((this.totalSpent / this.monthlyBudgetLimit) * 100));
  }

  get budgetStatusLabel(): string {
    if (this.budgetUsedPercent >= 90) {
      return 'Critical';
    }

    if (this.budgetUsedPercent >= 70) {
      return 'Watch closely';
    }

    return 'On track';
  }

  get budgetStatusClass(): string {
    if (this.budgetUsedPercent >= 90) {
      return 'critical';
    }

    if (this.budgetUsedPercent >= 70) {
      return 'warning';
    }

    return 'healthy';
  }

  getCategoryCost(categoryName: string): number {
    return this.transactions
      .filter(tx => {
        return tx.category.toLowerCase() === categoryName.toLowerCase() && 
               tx.type === 'expense';
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }

  downloadReport(): void {
    if (!isPlatformBrowser(this.platformId) || this.transactions.length === 0) {
      return;
    }

    const rows = [
      ['Description', 'Category', 'Date', 'Type', 'Amount', 'Status'],
      ...this.transactions.map(tx => [
        tx.description,
        tx.category,
        tx.date,
        tx.type,
        tx.amount.toString(),
        tx.status || 'Completed'
      ])
    ];

    const csv = rows
      .map(row => row.map(value => this.escapeCsv(value)).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fintrack-transactions-${this.selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private getLedgerErrorMessage(err: any): string {
    if (err?.name === 'TimeoutError') {
      return 'This is taking longer than expected. Try refreshing again.';
    }

    if (err?.status === 0) {
      return 'We cannot connect right now. The server may be down or still starting.';
    }

    return err?.error?.message || 'Could not load transactions right now.';
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

  private isInSelectedMonth(dateValue: string): boolean {
    const txDate = new Date(dateValue);
    const selectedDate = this.getSelectedMonthDate();
    return txDate.getFullYear() === selectedDate.getFullYear() &&
      txDate.getMonth() === selectedDate.getMonth();
  }

  private getSelectedMonthDate(): Date {
    if (!this.selectedMonth) {
      return new Date();
    }

    const [year, month] = this.selectedMonth.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }
}
