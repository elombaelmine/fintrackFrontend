import { Injectable } from '@angular/core';

export interface BudgetConfig {
  monthlyLimit: number;
  categoryLimits: Record<string, number>;
}

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private readonly categoryStorageKey = 'fintrack_budget_limits';
  private readonly monthlyLimitStorageKey = 'fintrack_monthly_budget_limit';
  private readonly defaultCategoryLimits: Record<string, number> = {
    Housing: 150000,
    Food: 100000,
    Transport: 70000,
    Entertainment: 60000,
    Shopping: 80000
  };

  getBudgetConfig(): BudgetConfig {
    const categoryLimits = this.getCategoryLimits();
    return {
      categoryLimits,
      monthlyLimit: this.getMonthlyBudgetLimit(categoryLimits)
    };
  }

  getCategoryLimits(): Record<string, number> {
    const categoryLimits = { ...this.defaultCategoryLimits };

    if (typeof localStorage === 'undefined') {
      return categoryLimits;
    }

    try {
      const savedLimits = localStorage.getItem(this.categoryStorageKey);
      if (!savedLimits) {
        return categoryLimits;
      }

      const parsedLimits = JSON.parse(savedLimits) as Record<string, number>;
      Object.entries(parsedLimits).forEach(([name, limit]) => {
        const cleanName = name.trim();
        const cleanLimit = Math.max(0, Number(limit) || 0);

        if (cleanName) {
          categoryLimits[cleanName] = cleanLimit;
        }
      });
    } catch {
      return categoryLimits;
    }

    return categoryLimits;
  }

  getMonthlyBudgetLimit(categoryLimits = this.getCategoryLimits()): number {
    const categoryTotal = this.getCategoryLimitTotal(categoryLimits);

    if (typeof localStorage === 'undefined') {
      return categoryTotal;
    }

    try {
      const storedLimit = localStorage.getItem(this.monthlyLimitStorageKey);
      const parsedLimit = storedLimit ? Math.max(0, Number(storedLimit) || 0) : 0;
      return parsedLimit > 0 ? parsedLimit : categoryTotal;
    } catch {
      return categoryTotal;
    }
  }

  saveMonthlyBudgetLimit(limit: number): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.monthlyLimitStorageKey, String(Math.max(0, Number(limit) || 0)));
  }

  saveCategoryLimits(categoryLimits: Record<string, number>): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.categoryStorageKey, JSON.stringify(this.cleanCategoryLimits(categoryLimits)));
  }

  getCategoryLimitTotal(categoryLimits: Record<string, number>): number {
    return Object.values(categoryLimits).reduce((sum, limit) => sum + (Math.max(0, Number(limit) || 0)), 0);
  }

  getBudgetOptions(categoryLimits = this.getCategoryLimits()): string[] {
    return Object.entries(categoryLimits)
      .filter(([, limit]) => Math.max(0, Number(limit) || 0) > 0)
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b));
  }

  cleanCategoryLimits(categoryLimits: Record<string, number>): Record<string, number> {
    return Object.entries(categoryLimits).reduce<Record<string, number>>((cleanLimits, [name, limit]) => {
      const cleanName = name.trim();
      const cleanLimit = Math.max(0, Number(limit) || 0);

      if (cleanName) {
        cleanLimits[cleanName] = cleanLimit;
      }

      return cleanLimits;
    }, {});
  }
}
