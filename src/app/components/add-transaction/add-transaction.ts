import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../notification.service';
import { BudgetService } from '../../budget.service';
import { finalize, switchMap, throwError, timeout } from 'rxjs';

interface BudgetTransaction {
  date: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
}

@Component({
  selector: 'app-add-transaction',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-transaction.html',
  styleUrls: ['./add-transaction.css']
})
export class AddTransaction implements OnInit {
  transaction = {
    description: '',
    amount: null as number | null,
    type: '',
    category: '',
    date: '',
    status: 'Completed'
  };

  errorMessage = '';
  successMessage = '';
  isSubmitting = false;
  budgetOptions: string[] = [];

  constructor(
    private router: Router,
    private apiService: ApiService,
    private notificationService: NotificationService,
    private budgetService: BudgetService
  ) { }

  ngOnInit(): void {
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    this.transaction.date = localDate.toISOString().slice(0, 10);
    this.loadBudgetOptions();
  }

  onTransactionTypeChange(): void {
    this.loadBudgetOptions();

    if (this.transaction.type === 'expense' && this.transaction.category === 'Income') {
      this.transaction.category = '';
    }
  }

  onSubmitTransaction(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.transaction.description || !this.transaction.amount || !this.transaction.type || !this.transaction.category || !this.transaction.date) {
      this.errorMessage = 'Please complete all transaction fields.';
      return;
    }

    if (this.transaction.amount <= 0) {
      this.errorMessage = 'Amount must be greater than zero.';
      return;
    }

    this.isSubmitting = true;

    this.apiService.getTransactions().pipe(
      timeout(10000),
      switchMap((transactions: BudgetTransaction[]) => {
        const budgetError = this.getBudgetImpactError(transactions || []);

        if (budgetError) {
          return throwError(() => new Error(budgetError));
        }

        return this.apiService.createTransaction(this.transaction).pipe(timeout(10000));
      }),
      finalize(() => {
        this.isSubmitting = false;
      })
    ).subscribe({
      next: () => {
        this.successMessage = 'Transaction saved successfully.';
        this.notificationService.refreshBudgetNotifications();
        setTimeout(() => this.router.navigate(['/overview']), 700);
      },
      error: (err) => {
        this.errorMessage = err?.message || err?.error?.message || 'Could not save this transaction.';
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/overview']);
  }

  private loadBudgetOptions(): void {
    this.budgetOptions = this.budgetService.getBudgetOptions();
  }

  private getBudgetImpactError(existingTransactions: BudgetTransaction[]): string | null {
    const amount = Number(this.transaction.amount) || 0;
    const category = this.transaction.category.trim();
    const monthKey = this.transaction.date.slice(0, 7);
    const budgetConfig = this.budgetService.getBudgetConfig();
    const categoryLimit = budgetConfig.categoryLimits[category];
    const isBudgetCategory = categoryLimit !== undefined;

    if (this.transaction.type === 'income') {
      if (category !== 'Income' && !isBudgetCategory) {
        return 'Choose one of your budgets, or select Core Income for general income.';
      }

      return null;
    }

    if (this.transaction.type !== 'expense') {
      return null;
    }

    if (!isBudgetCategory) {
      return 'Choose one of your budgets for this expense.';
    }

    const monthExpenses = existingTransactions
      .filter(tx => tx.type === 'expense' && this.isInMonth(tx.date, monthKey))
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    if (monthExpenses + amount > budgetConfig.monthlyLimit) {
      return `This expense would go over your monthly budget. You have ${this.formatCurrency(Math.max(0, budgetConfig.monthlyLimit - monthExpenses))} left this month.`;
    }

    const categoryExpenses = existingTransactions
      .filter(tx => tx.type === 'expense' && tx.category === category && this.isInMonth(tx.date, monthKey))
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const categoryCredits = existingTransactions
      .filter(tx => tx.type === 'income' && tx.category === category && this.isInMonth(tx.date, monthKey))
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const categoryAvailable = (categoryLimit || 0) + categoryCredits;

    if (categoryExpenses + amount > categoryAvailable) {
      return `This expense would go over your ${category} budget. You have ${this.formatCurrency(Math.max(0, categoryAvailable - categoryExpenses))} left there.`;
    }

    return null;
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
}
