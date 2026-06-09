import {
  Component, ElementRef, input, output, signal, viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ImageAttachment } from './chat.service';

@Component({
  selector: 'app-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="composer" [class.disabled]="streaming()">
      @if (attachments().length) {
        <div class="thumb-row">
          @for (a of attachments(); track a.previewUrl) {
            <div class="thumb-chip">
              <img [src]="a.previewUrl" alt="adjunto" />
              <button class="rm" type="button" aria-label="Quitar imagen"
                (click)="removeAttachment(a)">
                <mat-icon aria-hidden="true">close</mat-icon>
              </button>
            </div>
          }
        </div>
      }

      <div class="input-row">
        <button class="round-btn" type="button" aria-label="Adjuntar imagen"
          title="Adjuntar imagen" (click)="fileInput.click()">
          <mat-icon aria-hidden="true">add_photo_alternate</mat-icon>
        </button>
        <input #fileInput type="file" accept="image/*" multiple class="hidden-file"
          (change)="onFiles($event)" aria-label="Adjuntar imágenes" />

        <textarea
          #ta
          class="ta"
          aria-label="Mensaje"
          rows="1"
          placeholder="Escribí un mensaje…"
          [value]="text()"
          (input)="onInput($event)"
          (keydown.enter)="onEnter($event)"
        ></textarea>

        @if (speechSupported) {
          <button
            class="round-btn mic"
            type="button"
            [class.listening]="listening()"
            [attr.aria-label]="listening() ? 'Detener dictado' : 'Dictar'"
            title="Dictar"
            (click)="toggleMic()"
          >
            <mat-icon aria-hidden="true">mic</mat-icon>
          </button>
        }

        @if (streaming()) {
          <button class="send-btn stop" type="button" aria-label="Detener" (click)="stop.emit()">
            <mat-icon aria-hidden="true">stop</mat-icon>
          </button>
        } @else {
          <button class="send-btn" type="button" aria-label="Enviar"
            [disabled]="!canSend()" (click)="doSend()">
            <mat-icon aria-hidden="true">arrow_upward</mat-icon>
          </button>
        }
      </div>
    </div>

    <p class="hint">Enter para enviar · Shift+Enter para salto de línea</p>
  `,
  styles: [`
    .composer {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 24px;
      box-shadow: var(--shadow-md);
      padding: 6px 6px 6px 14px;
      transition: border-color .15s, box-shadow .15s;
    }
    .composer:focus-within {
      border-color: var(--brand-accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-accent) 25%, transparent);
    }

    .thumb-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 0 8px; }
    .thumb-chip { position: relative; width: 56px; height: 56px; }
    .thumb-chip img {
      width: 56px; height: 56px; border-radius: 10px; object-fit: cover; display: block;
    }
    .rm {
      position: absolute; top: -6px; right: -6px;
      width: 18px; height: 18px; border-radius: 50%;
      background: rgba(0,0,0,.7); border: none; cursor: pointer;
      color: #fff; display: flex; align-items: center; justify-content: center;
      padding: 0;
    }
    .rm mat-icon { font-size: 12px; width: 12px; height: 12px; line-height: 12px; }

    .input-row { display: flex; align-items: flex-end; gap: 8px; }

    .round-btn {
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .round-btn:hover { background: var(--bg-hover); }
    .round-btn mat-icon { font-size: 20px; width: 20px; height: 20px; line-height: 20px; }
    .round-btn.mic.listening { color: var(--color-error); animation: mic-pulse 1s ease-in-out infinite; }

    .hidden-file {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    .ta {
      flex: 1; border: none; outline: none; background: transparent;
      resize: none; color: var(--text-primary); font: inherit;
      font-size: 0.95rem; line-height: 1.5; max-height: 200px;
      overflow-y: auto; padding: 8px 0;
    }
    .ta::placeholder { color: var(--text-tertiary); }
    .composer.disabled .ta { opacity: .55; }

    .send-btn {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      border: none; cursor: pointer;
      background: var(--bg-tertiary); color: var(--text-tertiary);
      display: flex; align-items: center; justify-content: center;
      transition: all .15s;
    }
    .send-btn mat-icon { font-size: 20px; width: 20px; height: 20px; line-height: 20px; }
    .send-btn:not(:disabled):not(.stop) {
      background: var(--brand-accent); color: var(--bg-primary);
    }
    .send-btn:not(:disabled):not(.stop):hover { transform: scale(1.05); }
    .send-btn:disabled { cursor: default; }
    .send-btn.stop { background: var(--color-error); color: #fff; }
    .send-btn:active { transform: scale(.95); }

    .hint {
      font-size: .7rem; color: var(--text-tertiary);
      text-align: center; margin: 6px 0 0;
    }

    @keyframes mic-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }

    @media (max-width: 900px) { .hint { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      .round-btn.mic.listening { animation: none; }
      .send-btn:hover, .send-btn:active { transform: none; }
    }
  `],
})
export class ComposerComponent {
  readonly streaming = input(false);

  readonly send = output<{ text: string; images: ImageAttachment[] }>();
  readonly stop = output<void>();

  private readonly ta = viewChild.required<ElementRef<HTMLTextAreaElement>>('ta');

  readonly text = signal('');
  readonly attachments = signal<ImageAttachment[]>([]);

  // --- Web Speech API (nice-to-have) ---
  readonly speechSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  readonly listening = signal(false);
  private recognition: any = null;

  canSend(): boolean {
    return !this.streaming() && (this.text().trim().length > 0 || this.attachments().length > 0);
  }

  onInput(ev: Event): void {
    const el = ev.target as HTMLTextAreaElement;
    this.text.set(el.value);
    this.autogrow(el);
  }

  private autogrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  onEnter(ev: Event): void {
    const ke = ev as KeyboardEvent;
    if (ke.shiftKey) return; // newline
    ke.preventDefault();
    this.doSend();
  }

  doSend(): void {
    if (!this.canSend()) return;
    const payload = { text: this.text().trim(), images: this.attachments() };
    this.send.emit(payload);
    this.text.set('');
    this.attachments.set([]);
    const el = this.ta().nativeElement;
    el.value = '';
    el.style.height = 'auto';
  }

  async onFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const data = await this.toBase64(file);
      const attachment: ImageAttachment = {
        data,
        mediaType: file.type,
        previewUrl: URL.createObjectURL(file),
      };
      this.attachments.update((a) => [...a, attachment]);
    }
    input.value = '';
  }

  removeAttachment(a: ImageAttachment): void {
    URL.revokeObjectURL(a.previewUrl);
    this.attachments.update((list) => list.filter((x) => x !== a));
  }

  private toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- Voice dictation ---
  toggleMic(): void {
    if (this.listening()) {
      this.recognition?.stop();
      return;
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = this.text();
    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      const joined = (base ? base + ' ' : '') + transcript;
      this.text.set(joined);
      const el = this.ta().nativeElement;
      el.value = joined;
      this.autogrow(el);
    };
    rec.onend = () => this.listening.set(false);
    rec.onerror = () => this.listening.set(false);
    this.recognition = rec;
    this.listening.set(true);
    rec.start();
  }
}
