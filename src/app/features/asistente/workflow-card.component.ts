import { Component, computed, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { WorkflowState, WorkflowAgent } from './chat.service';

interface PhaseGroup {
  index: number;
  title: string;
  agents: WorkflowAgent[];
}

@Component({
  selector: 'app-workflow-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="wf-card" [attr.data-status]="wf().status">
      <button
        class="wf-header"
        type="button"
        [attr.aria-expanded]="expanded()"
        (click)="expanded.set(!expanded())"
      >
        <span class="status-slot">
          @switch (wf().status) {
            @case ('running') { <span class="spinner" aria-hidden="true"></span> }
            @case ('completed') { <mat-icon class="status-ok" aria-hidden="true">account_tree</mat-icon> }
            @case ('error') { <mat-icon class="status-err" aria-hidden="true">error</mat-icon> }
          }
        </span>
        <span class="wf-title">
          Workflow@if (wf().name) { · <span class="wf-name">{{ wf().name }}</span> }
        </span>
        <span class="agent-count">{{ doneCount() }}/{{ totalCount() }}</span>
        <span class="status-pill" [attr.data-status]="wf().status">{{ pillLabel() }}</span>
        <mat-icon class="chevron" [class.open]="expanded()" aria-hidden="true">expand_more</mat-icon>
      </button>

      @if (expanded()) {
        <div class="wf-body">
          @if (wf().description) {
            <div class="wf-desc">{{ wf().description }}</div>
          }
          @if (wf().status === 'running' && wf().activity) {
            <div class="wf-activity">
              <span class="spinner sm" aria-hidden="true"></span>
              <span>{{ wf().activity }}</span>
            </div>
          }

          @if (totalCount() > 0) {
            <div class="wf-progress-track" aria-hidden="true">
              <div class="wf-progress-fill" [style.width.%]="progressPct()"></div>
            </div>
          }

          @for (phase of phaseGroups(); track phase.index) {
            <div class="phase">
              <div class="phase-head">
                <span class="phase-idx">{{ phase.index }}</span>
                <span class="phase-title">{{ phase.title }}</span>
              </div>
              <div class="agents">
                @for (a of phase.agents; track a.index) {
                  <div class="agent-wrap">
                    <button
                      class="agent"
                      type="button"
                      [attr.data-state]="agentState(a)"
                      [class.expandable]="hasDetail(a)"
                      [attr.aria-expanded]="isAgentOpen(a.index)"
                      (click)="toggleAgent(a.index)"
                    >
                      <span class="agent-status">
                        @switch (agentState(a)) {
                          @case ('done') { <mat-icon aria-hidden="true">check_circle</mat-icon> }
                          @case ('error') { <mat-icon aria-hidden="true">error</mat-icon> }
                          @default { <span class="spinner sm" aria-hidden="true"></span> }
                        }
                      </span>
                      <span class="agent-label">{{ a.label }}</span>
                      @if (a.tokens) { <span class="agent-tokens">{{ fmtTokens(a.tokens) }} tok</span> }
                      @if (hasDetail(a)) {
                        <mat-icon class="agent-chevron" [class.open]="isAgentOpen(a.index)" aria-hidden="true">expand_more</mat-icon>
                      }
                    </button>

                    @if (isAgentOpen(a.index)) {
                      <div class="agent-detail">
                        <div class="agent-meta">
                          @if (a.model) { <span class="meta-chip">{{ shortModel(a.model) }}</span> }
                          @if (a.durationMs) { <span class="meta-chip">{{ fmtDuration(a.durationMs) }}</span> }
                          @if (a.tokens) { <span class="meta-chip">{{ fmtTokens(a.tokens) }} tok</span> }
                          @if (a.toolCalls) { <span class="meta-chip">{{ a.toolCalls }} tool calls</span> }
                          @if (a.attempt && a.attempt > 1) { <span class="meta-chip warn">intento {{ a.attempt }}</span> }
                        </div>
                        @if (a.promptPreview) {
                          <div class="detail-section">
                            <div class="detail-label">TAREA</div>
                            <pre class="detail-pre">{{ a.promptPreview }}</pre>
                          </div>
                        }
                        @if (a.resultPreview) {
                          <div class="detail-section">
                            <div class="detail-label">RESULTADO</div>
                            <pre class="detail-pre">{{ a.resultPreview }}</pre>
                          </div>
                        } @else if (agentState(a) === 'running') {
                          <div class="detail-running"><span class="spinner sm" aria-hidden="true"></span> ejecutando…</div>
                        }
                      </div>
                    }
                  </div>
                }
                @if (!phase.agents.length) {
                  <div class="agent pending-phase">
                    <span class="agent-status"><mat-icon aria-hidden="true">schedule</mat-icon></span>
                    <span class="agent-label">en cola…</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .wf-card {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-left: 3px solid var(--border-strong);
      border-radius: 10px;
      margin: 8px 0;
      overflow: hidden;
    }
    .wf-card[data-status='running'] { border-left-color: var(--color-warning); }
    .wf-card[data-status='completed'] { border-left-color: var(--color-success); }
    .wf-card[data-status='error'] { border-left-color: var(--color-error); }

    .wf-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; cursor: pointer;
      background: transparent; border: none; width: 100%;
      text-align: left; font-size: .82rem; color: var(--text-primary);
      transition: background .15s;
    }
    .wf-header:hover { background: var(--bg-hover); }

    .status-slot {
      width: 18px; height: 18px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .status-slot mat-icon { font-size: 17px; width: 18px; height: 18px; line-height: 18px; }
    .status-ok { color: var(--color-success); }
    .status-err { color: var(--color-error); }

    .wf-title {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-weight: 600; flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .wf-name { color: var(--text-primary); }

    .agent-count {
      flex-shrink: 0; font-variant-numeric: tabular-nums;
      font-size: .72rem; font-weight: 700; color: var(--text-secondary);
    }

    .status-pill {
      flex-shrink: 0;
      font-size: .62rem; font-weight: 700; letter-spacing: .04em;
      padding: 2px 8px; border-radius: 10px; text-transform: uppercase;
    }
    .status-pill[data-status='running'] {
      background: color-mix(in srgb, var(--color-warning) 18%, transparent);
      color: var(--color-warning);
    }
    .status-pill[data-status='completed'] {
      background: color-mix(in srgb, var(--color-success) 18%, transparent);
      color: var(--color-success);
    }
    .status-pill[data-status='error'] {
      background: color-mix(in srgb, var(--color-error) 18%, transparent);
      color: var(--color-error);
    }

    .chevron {
      flex-shrink: 0; color: var(--text-tertiary); font-size: 20px;
      width: 20px; height: 20px; line-height: 20px; transition: transform .2s;
    }
    .chevron.open { transform: rotate(180deg); }

    .wf-body {
      border-top: 1px solid var(--border-light);
      padding: 8px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .wf-desc { font-size: .76rem; color: var(--text-secondary); line-height: 1.4; }
    .wf-activity {
      display: flex; align-items: center; gap: 8px;
      font-size: .74rem; color: var(--text-secondary);
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    }

    .wf-progress-track {
      height: 4px; border-radius: 4px; overflow: hidden;
      background: var(--bg-secondary);
    }
    .wf-progress-fill {
      height: 100%; border-radius: 4px;
      background: var(--bg-selected); transition: width .3s ease;
    }

    .phase {
      border-left: 2px solid var(--border-color);
      padding-left: 8px;
    }
    .phase-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .phase-idx {
      width: 17px; height: 17px; border-radius: 50%; flex-shrink: 0;
      background: var(--bg-secondary); color: var(--text-secondary);
      font-size: .62rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .phase-title { font-size: .78rem; font-weight: 600; color: var(--text-primary); }

    .agents { display: flex; flex-direction: column; gap: 4px; }
    .agent-wrap { display: flex; flex-direction: column; }
    .agent {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 8px; border-radius: 7px;
      background: var(--bg-secondary);
      font-size: .76rem; color: var(--text-secondary);
      width: 100%; text-align: left; border: none; font-family: inherit;
      cursor: default;
    }
    .agent.expandable { cursor: pointer; }
    .agent.expandable:hover { background: var(--bg-hover); }
    .agent[data-state='done'] { color: var(--text-primary); }
    .agent.pending-phase { opacity: .6; }
    .agent-chevron {
      flex-shrink: 0; color: var(--text-tertiary);
      font-size: 15px; width: 16px; height: 16px; line-height: 16px;
      transition: transform .2s;
    }
    .agent-chevron.open { transform: rotate(180deg); }

    .agent-detail {
      margin: 2px 0 4px 8px;
      padding: 8px 8px;
      border-left: 2px solid var(--border-color);
      display: flex; flex-direction: column; gap: 8px;
    }
    .agent-meta { display: flex; flex-wrap: wrap; gap: 4px; }
    .meta-chip {
      font-size: .64rem; font-weight: 600;
      padding: 2px 8px; border-radius: 9px;
      background: var(--bg-tertiary); color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .meta-chip.warn {
      background: color-mix(in srgb, var(--color-warning) 18%, transparent);
      color: var(--color-warning);
    }
    .detail-label {
      font-size: .58rem; font-weight: 700; letter-spacing: .5px;
      text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 4px;
    }
    .detail-pre {
      margin: 0; padding: 8px 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-light); border-radius: 6px;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: .7rem; line-height: 1.45; color: var(--text-secondary);
      white-space: pre-wrap; word-break: break-word;
      max-height: 200px; overflow: auto;
    }
    .detail-running {
      display: flex; align-items: center; gap: 8px;
      font-size: .72rem; color: var(--text-tertiary);
    }
    .agent-status {
      width: 15px; height: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .agent-status mat-icon { font-size: 15px; width: 15px; height: 15px; line-height: 15px; }
    .agent[data-state='done'] .agent-status mat-icon { color: var(--color-success); }
    .agent[data-state='error'] .agent-status mat-icon { color: var(--color-error); }
    .agent-label {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .agent-tokens {
      flex-shrink: 0; font-size: .66rem; color: var(--text-tertiary);
      font-variant-numeric: tabular-nums;
    }

    .spinner {
      width: 14px; height: 14px;
      border: 2px solid var(--border-color);
      border-top-color: var(--color-warning);
      border-radius: 50%; animation: spin .7s linear infinite;
    }
    .spinner.sm { width: 12px; height: 12px; border-width: 2px; }

    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .spinner { animation: none; }
      .chevron, .wf-progress-fill { transition: none; }
    }
  `],
})
export class WorkflowCardComponent {
  readonly wf = input.required<WorkflowState>();
  readonly expanded = signal(true);

  /** Indices of agents whose drill-down detail is open. */
  private readonly openAgents = signal<ReadonlySet<number>>(new Set());

  isAgentOpen(index: number): boolean {
    return this.openAgents().has(index);
  }

  toggleAgent(index: number): void {
    const next = new Set(this.openAgents());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.openAgents.set(next);
  }

  hasDetail(a: WorkflowAgent): boolean {
    return !!(a.promptPreview || a.resultPreview || a.model || a.durationMs);
  }

  /** 'claude-opus-4-8[1m]' -> 'opus-4-8'. */
  shortModel(model: string): string {
    return model.replace(/^claude-/, '').replace(/\[.*$/, '');
  }

  fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`;
  }

  readonly totalCount = computed(() => this.wf().agents.length);

  readonly doneCount = computed(
    () => this.wf().agents.filter((a) => this.agentState(a) === 'done').length,
  );

  readonly progressPct = computed(() => {
    const total = this.totalCount();
    return total ? Math.round((this.doneCount() / total) * 100) : 0;
  });

  /** Group agents under their phase; show every declared phase even if empty. */
  readonly phaseGroups = computed<PhaseGroup[]>(() => {
    const w = this.wf();
    const groups = new Map<number, PhaseGroup>();
    for (const p of w.phases) {
      groups.set(p.index, { index: p.index, title: p.title, agents: [] });
    }
    for (const a of w.agents) {
      let g = groups.get(a.phaseIndex);
      if (!g) {
        g = { index: a.phaseIndex, title: a.phaseTitle || `Fase ${a.phaseIndex}`, agents: [] };
        groups.set(a.phaseIndex, g);
      }
      g.agents.push(a);
    }
    return [...groups.values()].sort((x, y) => x.index - y.index);
  });

  readonly pillLabel = computed(() => {
    switch (this.wf().status) {
      case 'running': return 'Ejecutando…';
      case 'completed': return 'Listo';
      case 'error': return 'Error';
    }
  });

  /** Normalize the raw agent state into a render bucket. */
  agentState(a: WorkflowAgent): 'done' | 'error' | 'running' {
    if (a.state === 'done') return 'done';
    if (a.state === 'error' || a.state === 'failed') return 'error';
    return 'running';
  }

  fmtTokens(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
}
