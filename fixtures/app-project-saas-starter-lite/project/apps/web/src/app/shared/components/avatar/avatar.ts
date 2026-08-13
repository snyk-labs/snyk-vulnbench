import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    @if (src) {
      <img [src]="src" [alt]="name" [class]="getSizeClass()" class="rounded-full object-cover" />
    } @else {
      <div [class]="getSizeClass()" class="rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-bold">
        {{ getInitial() }}
      </div>
    }
  `,
})
export class AvatarComponent {
  @Input() src?: string;
  @Input() name = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  getInitial(): string {
    return (this.name?.[0] || '?').toUpperCase();
  }

  getSizeClass(): string {
    const sizes: Record<string, string> = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' };
    return sizes[this.size];
  }
}
