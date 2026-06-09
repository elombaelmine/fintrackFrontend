import { Routes } from '@angular/router';
import { Auth } from './components/auth/auth'; // We'll create this next
import { Budget } from './components/budget/budget';
import { History } from './components/history/history';
import { Overview } from './components/overview/overview';
import { Settings } from './components/settings/settings';
import { Support } from './components/support/support';
import { AddTransaction } from './components/add-transaction/add-transaction';
import { Notifications } from './components/notifications/notifications';

export const routes: Routes = [
  { path: 'auth', component: Auth },
  { path: 'overview', component: Overview },
  { path: 'budget', component: Budget },
  { path: 'history', component: History },  
  { path: 'support', component: Support },
  { path: 'settings', component: Settings }, // Reusing Settings component
  { path: 'notifications', component: Notifications },
  { path: 'add-transaction', component: AddTransaction },

  // Change default landing redirect from '/overview' to '/auth'
  { path: '', redirectTo: '/auth', pathMatch: 'full' },
  { path: '**', redirectTo: '/auth' }
];
