import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { ToastComponent } from './shared/components/toast/toast';

@Component({
  imports: [RouterOutlet, ToastComponent],
  selector: 'app-root',
  template: `
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg">
      Skip to content
    </a>
    <main id="main-content">
      <router-outlet />
    </main>
    <app-toast />
  `,
  styles: ':host { display: block; min-height: 100vh; }',
})
export class App implements OnInit {
  private themeService = inject(ThemeService);

  ngOnInit() {
    this.themeService.init();
  }
}
