import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { finalize, timeout } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

interface Transaction {
  date: string;
  description: string;
  category: string;
  status?: string;
  amount: number;
  type: 'income' | 'expense';
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrls: ['./history.css']
})
export class History implements OnInit {
  private allTransactions: Transaction[] = [];

  transactions: Transaction[] = [];

  totalIncome: number = 0;
  totalExpenses: number = 0;
  netTotal: number = 0;
  averageTransaction: number = 0;
  isLoadingHistory = false;
  historyError = '';

  filters = {
    days: '30',
    category: 'all',
    status: 'all',
    type: 'all',
    query: ''
  };

  constructor(
    private apiService: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.watchHeaderSearch();
      this.loadHistory();
    }
  }

  loadHistory(): void {
    if (this.isLoadingHistory) {
      return;
    }

    this.isLoadingHistory = true;
    this.historyError = '';

    this.apiService.getTransactions().pipe(
      timeout(10000),
      finalize(() => {
        this.isLoadingHistory = false;
        this.refreshView();
      })
    ).subscribe({
      next: (data: any) => {
        this.allTransactions = (data as Transaction[]) || [];
        this.applyFilters();
      },
      error: (err) => {
        console.error('Error loading history:', err);
        this.historyError = this.getHistoryErrorMessage(err);
        this.applyFilters();
      }
    });
  }

  calculateSummaries(): void {
    this.totalIncome = this.transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    this.totalExpenses = this.transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    this.netTotal = this.totalIncome - this.totalExpenses;
    const totalVolume = this.transactions.reduce((sum, t) => sum + t.amount, 0);
    this.averageTransaction = this.transactions.length > 0 ? totalVolume / this.transactions.length : 0;
  }

  applyFilters(): void {
    const query = this.filters.query.trim().toLowerCase();

    this.transactions = this.allTransactions.filter(t => {
      const transactionDate = this.parseTransactionDate(t.date);
      const matchDate = this.filters.days === 'all' || transactionDate >= this.getEarliestDate();

      const matchCategory = this.filters.category === 'all' || 
                            t.category.toLowerCase() === this.filters.category.toLowerCase();
      const matchStatus = this.filters.status === 'all' || 
                          this.getStatus(t).toLowerCase() === this.filters.status.toLowerCase();
      const matchType = this.filters.type === 'all' || t.type === this.filters.type;
      const matchQuery = !query ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query) ||
        this.getStatus(t).toLowerCase().includes(query);
      
      return matchDate && matchCategory && matchStatus && matchType && matchQuery;
    }).sort((a, b) => this.parseTransactionDate(b.date).getTime() - this.parseTransactionDate(a.date).getTime());

    this.calculateSummaries();
    this.refreshView();
  }

  resetFilters(): void {
    this.filters = {
      days: '30',
      category: 'all',
      status: 'all',
      type: 'all',
      query: ''
    };
    this.applyFilters();

    if (this.route.snapshot.queryParamMap.has('q')) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {}
      });
    }
  }

  private watchHeaderSearch(): void {
    this.route.queryParamMap.subscribe(params => {
      const query = (params.get('q') || '').trim();

      if (query) {
        this.filters.query = query;
        this.filters.days = 'all';
      } else {
        this.filters.query = '';
      }

      this.applyFilters();
    });
  }

  exportHistory(): void {
    if (!isPlatformBrowser(this.platformId) || this.transactions.length === 0) {
      return;
    }

    const rows = [
      ['Date', 'Description', 'Category', 'Status', 'Type', 'Amount'],
      ...this.transactions.map(t => [
        t.date,
        t.description,
        t.category,
        this.getStatus(t),
        t.type,
        String(t.amount)
      ])
    ];

    const csv = rows
      .map(row => row.map(value => this.escapeCsv(value)).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fintrack-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  get categoryOptions(): string[] {
    return Array.from(new Set(this.allTransactions.map(t => t.category))).sort();
  }

  get statusOptions(): string[] {
    return Array.from(new Set(this.allTransactions.map(t => this.getStatus(t)))).sort();
  }

  getStatus(transaction: Transaction): string {
    return transaction.status || 'Completed';
  }

  statusClass(transaction: Transaction): string {
    return this.getStatus(transaction).toLowerCase().replace(/\s+/g, '-');
  }

  private getEarliestDate(): Date {
    const earliestDate = new Date();
    earliestDate.setHours(0, 0, 0, 0);
    earliestDate.setDate(earliestDate.getDate() - Number(this.filters.days));
    return earliestDate;
  }

  private parseTransactionDate(dateValue: string): Date {
    const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private getHistoryErrorMessage(err: any): string {
    if (err?.name === 'TimeoutError') {
      return 'This is taking longer than expected. Try refreshing again.';
    }

    if (err?.status === 0) {
      return 'We cannot connect right now. The server may be down or still starting.';
    }

    return err?.error?.message || 'Could not load transaction history.';
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
