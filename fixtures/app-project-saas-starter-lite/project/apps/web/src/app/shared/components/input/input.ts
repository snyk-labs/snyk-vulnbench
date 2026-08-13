import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => InputComponent),
    multi: true,
  }],
  template: `
    <div>
      @if (label) {
        <label [attr.for]="inputId" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{{ label }}</label>
      }
      <input
        [id]="inputId"
        [type]="type"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [value]="value"
        (input)="onInput($event)"
        (blur)="onTouched()"
        class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  `,
})
export class InputComponent implements ControlValueAccessor {
  private static nextId = 0;
  readonly inputId = `app-input-${InputComponent.nextId++}`;

  @Input() label = '';
  @Input() type = 'text';
  @Input() placeholder = '';

  value = '';
  disabled = false;
  onChange: (val: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.value = val;
    this.onChange(val);
  }

  writeValue(val: string) { this.value = val || ''; }
  registerOnChange(fn: (val: string) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(disabled: boolean) { this.disabled = disabled; }
}
