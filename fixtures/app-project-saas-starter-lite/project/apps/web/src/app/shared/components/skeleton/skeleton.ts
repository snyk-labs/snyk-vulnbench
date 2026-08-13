import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `
    <div class="animate-pulse" [class]="containerClass">
      @for (i of rows; track i) {
        <div class="rounded" [class]="lineClass" [style.width]="getWidth(i)"></div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `,
})
export class SkeletonComponent {
  @Input() variant: 'text' | 'card' | 'table' = 'text';
  @Input() count = 3;

  get rows() { return Array.from({ length: this.count }, (_, i) => i); }

  get containerClass(): string {
    if (this.variant === 'card') return 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-3';
    if (this.variant === 'table') return 'space-y-2';
    return 'space-y-3';
  }

  get lineClass(): string { return 'h-4 bg-slate-200 dark:bg-slate-700 rounded'; }

  getWidth(index: number): string {
    const widths = ['100%', '85%', '70%', '90%', '60%'];
    return widths[index % widths.length];
  }
}
