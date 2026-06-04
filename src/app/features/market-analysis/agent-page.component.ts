import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AgentChatComponent } from './agent-chat.component';

@Component({
  selector: 'app-agent-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, AgentChatComponent],
  template: `
    <div class="agent-page">
      <app-agent-chat
        [fullscreen]="true"
        (collapse)="goBack()"
        (toggleFullscreen)="goBack()"></app-agent-chat>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .agent-page {
        height: 100%;
        max-width: 1100px;
        margin: 0 auto;
        padding: 0;
        display: flex;
      }

      app-agent-chat {
        flex: 1;
        min-height: 0;
        display: flex;
      }
    `,
  ],
})
export class AgentPageComponent {
  constructor(private readonly router: Router) {}

  goBack(): void {
    void this.router.navigate(['/market-analysis']);
  }
}
