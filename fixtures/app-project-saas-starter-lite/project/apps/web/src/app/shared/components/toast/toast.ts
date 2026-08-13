import { Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div role="alert" class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[320px] max-w-md animate-slide-in" [class]="getToastClasses(toast.type)">
          <span class="text-lg">{{ getIcon(toast.type) }}</span>
          <span class="flex-1 text-sm font-medium">{{ toast.message }}</span>
          <button (click)="toastService.dismiss(toast.id)" class="text-current opacity-60 hover:opacity-100 transition-opacity">&times;</button>
        </div>
      }
    </div>
  `,
  styles: `
    @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .animate-slide-in { animation: slide-in 0.3s ease-out; }
  `,
})
export class ToastComponent {
  toastService = inject(ToastService);

  getToastClasses(type: string): string {
    const base = 'border';
    switch (type) {
      case 'success': return `${base} bg-success-50 text-success-800 border-success-200 dark:bg-success-900/30 dark:text-success-300 dark:border-success-800`;
      case 'error': return `${base} bg-danger-50 text-danger-800 border-danger-200 dark:bg-danger-900/30 dark:text-danger-300 dark:border-danger-800`;
      case 'warning': return `${base} bg-warning-50 text-warning-800 border-warning-200 dark:bg-warning-900/30 dark:text-warning-300 dark:border-warning-800`;
      default: return `${base} bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800`;
    }
  }

  getIcon(type: string): string {
    switch (type) {
      case 'success': return '\u2713';
      case 'error': return '\u2717';
      case 'warning': return '\u26A0';
      default: return '\u2139';
    }
  }
}
