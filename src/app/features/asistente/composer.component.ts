import {
  Component, ElementRef, input, output, signal, viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ImageAttachment } from './chat.service';

// ============================================================================
// SLASH COMMANDS (estilo Claude Code, manejados del lado del cliente)
//
// - kind 'action': lo resuelve el shell (limpiar, nueva, modelo, costo, copiar).
//   El composer emite (command); /help y los que piden args se quedan en el
//   composer para autocompletar.
// - kind 'prompt': se expande a un mensaje en lenguaje natural y se envía al
//   agente como cualquier turno (incluye /chart, que dispara el chart-action
//   que el backend ya soporta).
// ============================================================================

export interface CommandEvent {
  name: string;
  args: string;
}

type CmdKind = 'action' | 'prompt';

interface SlashCommand {
  name: string;
  desc: string;
  kind: CmdKind;
  /** hint de argumentos (presencia = acepta args → al elegirlo se rellena, no ejecuta). */
  args?: string;
  /** completados predefinidos del argumento (ej. modelos). */
  argOptions?: string[];
  /** para kind 'prompt': arma el mensaje al agente. */
  expand?: (args: string) => string;
}

const COMMANDS: SlashCommand[] = [
  // --- Acciones de UI ---
  { name: 'clear', desc: 'Limpiar la conversación actual', kind: 'action' },
  { name: 'new', desc: 'Nueva conversación', kind: 'action' },
  {
    name: 'model', desc: 'Cambiar el modelo', kind: 'action',
    args: '<sonnet|opus|haiku>', argOptions: ['sonnet', 'opus', 'haiku'],
  },
  { name: 'cost', desc: 'Ver el costo del hilo', kind: 'action' },
  { name: 'usage', desc: 'Ver uso de tokens y costo de Claude', kind: 'action' },
  { name: 'copy', desc: 'Copiar la última respuesta', kind: 'action' },
  { name: 'help', desc: 'Ver todos los comandos', kind: 'action' },
  // --- Atajos de dominio ---
  {
    name: 'portfolio', desc: 'Resumen de tu portfolio', kind: 'prompt',
    expand: () => 'Dame un resumen completo de mi portfolio: balances consolidados, % por asset, valor total en USD y P&L.',
  },
  {
    name: 'balances', desc: 'Balances por exchange', kind: 'prompt',
    expand: () => 'Mostrame mis balances por exchange, con el valor en USD de cada uno.',
  },
  {
    name: 'precios', desc: 'Precio actual', kind: 'prompt', args: '[PAR]',
    expand: (a) => (a ? `Precio actual de ${a.toUpperCase()}.` : 'Precios actuales de mis principales pares.'),
  },
  {
    name: 'pnl', desc: 'Resumen de P&L', kind: 'prompt',
    expand: () => '¿Cómo viene mi P&L? Dame el resumen del período, con ganadores y perdedores.',
  },
  {
    name: 'market', desc: 'Análisis de mercado', kind: 'prompt', args: '[PAR]',
    expand: (a) => `Analizá el mercado de ${a ? a.toUpperCase() : 'BTC/USDT'}: tendencia, RSI, MACD, Bollinger y niveles clave.`,
  },
  // --- Control del gráfico (el backend emite chart-action) ---
  {
    name: 'chart', desc: 'Cambiar el gráfico de market-analysis', kind: 'prompt', args: '[PAR] [tf]',
    expand: (a) => {
      const [pair, tf] = a.split(/\s+/);
      return `Cambiá el gráfico de market-analysis a ${pair ? pair.toUpperCase() : 'BTC/USDT'}${tf ? ` en ${tf}` : ''} y marcá los niveles clave.`;
    },
  },
];

@Component({
  selector: 'app-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="composer" [class.disabled]="streaming()">
      @if (paletteOpen()) {
        <div class="cmd-palette" role="listbox">
          @if (mode() === 'cmd') {
            @for (c of cmdMatches(); track c.name; let i = $index) {
              <button class="cmd-row" type="button" role="option"
                [class.active]="activeIndex() === i"
                (mousedown)="$event.preventDefault()"
                (mouseenter)="activeIndex.set(i)"
                (click)="pickIndex(i)">
                <span class="cmd-name">/{{ c.name }}@if (c.args) {<span class="cmd-args"> {{ c.args }}</span>}</span>
                <span class="cmd-desc">{{ c.desc }}</span>
              </button>
            }
          } @else {
            @for (a of argMatches(); track a; let i = $index) {
              <button class="cmd-row" type="button" role="option"
                [class.active]="activeIndex() === i"
                (mousedown)="$event.preventDefault()"
                (mouseenter)="activeIndex.set(i)"
                (click)="pickIndex(i)">
                <span class="cmd-name">{{ a }}</span>
                <span class="cmd-desc">{{ argDesc(a) }}</span>
              </button>
            }
          }
          <div class="cmd-foot">
            <span>↑↓ navegar</span><span>↵ usar</span><span>esc cerrar</span>
          </div>
        </div>
      }

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
          placeholder="Escribí un mensaje…  ( / para comandos )"
          [value]="text()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (blur)="onBlur()"
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

    @if (cmdError()) {
      <p class="hint error">{{ cmdError() }}</p>
    } @else {
      <p class="hint">Enter para enviar · Shift+Enter para salto de línea · / para comandos</p>
    }
  `,
  styles: [`
    .composer {
      position: relative;
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

    /* ===== Slash command palette (estilo CLI) ===== */
    .cmd-palette {
      position: absolute;
      left: 0; right: 0; bottom: calc(100% + 8px);
      background: var(--bg-elevated);
      border: 1px solid var(--border-light);
      border-radius: 14px;
      box-shadow: var(--shadow-lg);
      overflow: hidden auto;
      max-height: 300px;
      z-index: 30;
      padding: 6px;
    }
    .cmd-row {
      display: flex; align-items: baseline; gap: 12px;
      width: 100%; text-align: left;
      padding: 8px 12px; border: none; background: transparent;
      border-radius: 9px; cursor: pointer;
      transition: background .1s;
    }
    .cmd-row.active { background: color-mix(in srgb, var(--brand-accent) 16%, transparent); }
    .cmd-name {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
      font-size: .82rem; font-weight: 600;
      color: var(--brand-accent); white-space: nowrap; flex-shrink: 0;
    }
    .cmd-args { color: var(--text-tertiary); font-weight: 400; }
    .cmd-desc {
      font-size: .8rem; color: var(--text-secondary);
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-align: right;
    }
    .cmd-foot {
      display: flex; gap: 16px; justify-content: flex-end;
      padding: 6px 12px 2px; margin-top: 2px;
      border-top: 1px solid var(--border-color);
      font-size: .68rem; color: var(--text-tertiary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
    .hint.error { color: var(--color-error); }

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
  readonly command = output<CommandEvent>();

  private readonly ta = viewChild.required<ElementRef<HTMLTextAreaElement>>('ta');

  readonly text = signal('');
  readonly attachments = signal<ImageAttachment[]>([]);
  readonly cmdError = signal('');

  // --- Slash command palette state ---
  readonly paletteOpen = signal(false);
  readonly mode = signal<'cmd' | 'args'>('cmd');
  readonly cmdMatches = signal<SlashCommand[]>([]);
  readonly argMatches = signal<string[]>([]);
  readonly activeIndex = signal(0);
  private activeCommand: SlashCommand | null = null;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Web Speech API (nice-to-have) ---
  readonly speechSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  readonly listening = signal(false);
  private recognition: any = null;

  canSend(): boolean {
    return !this.streaming() && (this.text().trim().length > 0 || this.attachments().length > 0);
  }

  argDesc(value: string): string {
    return this.activeCommand?.name === 'model' ? `Modelo ${value}` : '';
  }

  onInput(ev: Event): void {
    const el = ev.target as HTMLTextAreaElement;
    this.text.set(el.value);
    this.cmdError.set('');
    this.autogrow(el);
    this.recompute();
  }

  onKeydown(ev: KeyboardEvent): void {
    if (this.paletteOpen()) {
      const n = this.visibleCount();
      switch (ev.key) {
        case 'ArrowDown':
          ev.preventDefault();
          if (n) this.activeIndex.set((this.activeIndex() + 1) % n);
          return;
        case 'ArrowUp':
          ev.preventDefault();
          if (n) this.activeIndex.set((this.activeIndex() - 1 + n) % n);
          return;
        case 'Tab':
          ev.preventDefault();
          this.acceptActive();
          return;
        case 'Enter':
          if (!ev.shiftKey) {
            ev.preventDefault();
            this.acceptActive();
          }
          return;
        case 'Escape':
          ev.preventDefault();
          this.closePalette();
          return;
      }
    }

    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.submit();
    }
  }

  onBlur(): void {
    // Defer so a click on a palette row (mousedown.prevent keeps focus) still
    // registers; closes when focus actually leaves the composer.
    this.blurTimer = setTimeout(() => this.closePalette(), 120);
  }

  doSend(): void {
    this.submit();
  }

  // --- Submit / command dispatch ---

  private submit(): void {
    if (this.streaming()) return;

    if (this.paletteOpen() && this.visibleCount()) {
      this.acceptActive();
      return;
    }

    const trimmed = this.text().trim();
    if (trimmed.startsWith('/')) {
      const m = trimmed.match(/^\/(\S+)\s*([\s\S]*)$/);
      const name = (m?.[1] ?? '').toLowerCase();
      const args = (m?.[2] ?? '').trim();
      const cmd = COMMANDS.find((c) => c.name === name);
      if (cmd) {
        this.execute(cmd, args);
      } else {
        this.cmdError.set(`Comando desconocido: /${name}`);
      }
      return;
    }

    if (!this.canSend()) return;
    this.emitSend(trimmed);
  }

  private execute(cmd: SlashCommand, args: string): void {
    // Acepta args pero no se pasó ninguno → rellenamos y dejamos completar.
    if ((cmd.args || cmd.argOptions) && !args) {
      this.fillCommand(cmd);
      return;
    }
    if (cmd.kind === 'prompt') {
      const msg = cmd.expand ? cmd.expand(args) : `/${cmd.name}${args ? ' ' + args : ''}`;
      this.emitSend(msg);
      return;
    }
    // action
    if (cmd.name === 'help') {
      this.setText('/');
      return;
    }
    this.command.emit({ name: cmd.name, args });
    this.clearInput();
  }

  private acceptActive(): void {
    if (this.mode() === 'cmd') {
      const cmd = this.cmdMatches()[this.activeIndex()];
      if (!cmd) return;
      if (cmd.args || cmd.argOptions) {
        this.fillCommand(cmd);
      } else {
        this.execute(cmd, '');
      }
    } else {
      const val = this.argMatches()[this.activeIndex()];
      if (!this.activeCommand || val == null) return;
      this.execute(this.activeCommand, val);
    }
  }

  private fillCommand(cmd: SlashCommand): void {
    this.setText(`/${cmd.name} `);
  }

  private emitSend(text: string): void {
    this.send.emit({ text, images: this.attachments() });
    this.attachments.set([]);
    this.clearInput();
  }

  // --- Palette computation ---

  private recompute(): void {
    const t = this.text();
    if (!t.startsWith('/')) {
      this.closePalette();
      return;
    }
    const m = t.match(/^\/(\S*)(\s+([\s\S]*))?$/);
    const name = (m?.[1] ?? '').toLowerCase();
    const hasSpace = m?.[2] != null;

    if (!hasSpace) {
      const list = COMMANDS.filter((c) => c.name.startsWith(name));
      this.activeCommand = null;
      this.mode.set('cmd');
      this.cmdMatches.set(list);
      this.argMatches.set([]);
      this.activeIndex.set(0);
      this.paletteOpen.set(list.length > 0);
      return;
    }

    const cmd = COMMANDS.find((c) => c.name === name);
    if (!cmd || !cmd.argOptions) {
      // comando libre de args (o desconocido): sin sugerencias
      this.closePalette();
      return;
    }
    const partial = (m?.[3] ?? '').trim().toLowerCase();
    const opts = cmd.argOptions.filter((o) => o.toLowerCase().startsWith(partial));
    this.activeCommand = cmd;
    this.mode.set('args');
    this.argMatches.set(opts);
    this.cmdMatches.set([]);
    this.activeIndex.set(0);
    this.paletteOpen.set(opts.length > 0);
  }

  private visibleCount(): number {
    return this.mode() === 'cmd' ? this.cmdMatches().length : this.argMatches().length;
  }

  pickIndex(i: number): void {
    this.activeIndex.set(i);
    this.acceptActive();
  }

  private closePalette(): void {
    this.paletteOpen.set(false);
    this.activeIndex.set(0);
  }

  /** Update signal + textarea DOM together, then refresh the palette. */
  private setText(value: string): void {
    this.text.set(value);
    const el = this.ta().nativeElement;
    el.value = value;
    el.focus();
    this.autogrow(el);
    this.recompute();
  }

  private clearInput(): void {
    this.text.set('');
    this.cmdError.set('');
    const el = this.ta().nativeElement;
    el.value = '';
    el.style.height = 'auto';
    this.closePalette();
  }

  private autogrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  // --- Image attachments ---

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
