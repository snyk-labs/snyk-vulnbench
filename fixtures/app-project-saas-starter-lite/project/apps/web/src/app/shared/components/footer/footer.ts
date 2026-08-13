import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="py-12 bg-slate-900 text-slate-400">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-8">
          <div>
            <h3 class="text-white font-semibold mb-4">Product</h3>
            <ul class="space-y-2 text-sm">
              <li><a href="#features" class="hover:text-white transition">Features</a></li>
              <li><a href="https://demo.cloudrix.io" class="hover:text-white transition">Full Version</a></li>
            </ul>
          </div>
          <div>
            <h3 class="text-white font-semibold mb-4">Resources</h3>
            <ul class="space-y-2 text-sm">
              <li><a href="https://github.com/cloudrix-saas/saas-starter-lite" class="hover:text-white transition">GitHub</a></li>
              <li><a href="#faq" class="hover:text-white transition">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 class="text-white font-semibold mb-4">Upgrade</h3>
            <p class="text-sm">Need payments, multi-tenancy, Docker, AWS?</p>
            <a href="https://demo.cloudrix.io" class="text-primary-400 hover:text-primary-300 text-sm font-medium transition">Get the full version</a>
          </div>
        </div>
        <div class="mt-12 pt-8 border-t border-slate-800 text-center text-sm">
          <p>SaaS Starter Lite -- Free &amp; open source. <a href="https://demo.cloudrix.io" class="text-primary-400 hover:text-primary-300">Get the Pro version</a></p>
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {}
